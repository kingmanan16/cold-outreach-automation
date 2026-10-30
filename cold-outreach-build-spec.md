# Cold outreach tool — build spec

## What we're building
A hosted (cloud) web app for running cold email campaigns from 3 custom-domain SMTP/IMAP mailboxes (Zoho, GoDaddy, or similar) across roughly 1,000 leads. Single user — no multi-tenant/team support needed. Core loop: upload leads → build a multi-step email sequence → app sends on a schedule across the 3 accounts respecting daily limits → app watches inboxes for replies and auto-stops the sequence for that lead → dashboard shows what's happening.

## Tech stack (locked in)
- Framework: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Database: PostgreSQL via Supabase + Prisma ORM
- Email sending: Nodemailer (SMTP)
- Email reading: imapflow (IMAP)
- Worker: a standalone Node.js process, separate from the Next.js app, for scheduled sending + IMAP polling
- Hosting: Vercel (Next.js app) + Railway (worker process) + Supabase (Postgres)
- Auth: single-password gate via middleware — this is a personal tool for one user, so a full auth system (NextAuth, etc.) is unnecessary complexity

## Getting started
```bash
npx create-next-app@latest cold-outreach --typescript --tailwind --eslint --app
cd cold-outreach
npm install prisma @prisma/client nodemailer imapflow papaparse
npm install -D tsx
npx prisma init --datasource-provider postgresql
```

## Environment variables
```
DATABASE_URL=          # Supabase connection string
APP_PASSWORD=          # gates the dashboard behind a single password
ENCRYPTION_KEY=        # 32-byte key used to encrypt SMTP/IMAP passwords at rest
```
Per-account SMTP/IMAP credentials live in the database (encrypted), not in env vars — there are 3 accounts now and more may get added later from the UI.

## Database schema (Prisma)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model EmailAccount {
  id            String      @id @default(cuid())
  email         String      @unique
  smtpHost      String
  smtpPort      Int
  smtpSecure    Boolean     @default(true)
  smtpUser      String
  smtpPassEnc   String
  imapHost      String
  imapPort      Int
  imapUser      String
  imapPassEnc   String
  dailyLimit    Int         @default(30)
  sentToday     Int         @default(0)
  lastResetDate DateTime    @default(now())
  isWarmedUp    Boolean     @default(false)
  createdAt     DateTime    @default(now())
  sentEmails    SentEmail[]
  replies       Reply[]
}

model LeadList {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  leads     Lead[]
}

enum LeadStatus {
  NEW
  QUEUED
  CONTACTED
  REPLIED
  INTERESTED
  NOT_INTERESTED
  BOUNCED
  UNSUBSCRIBED
}

model Lead {
  id            String         @id @default(cuid())
  email         String         @unique
  firstName     String?
  lastName      String?
  company       String?
  customFields  Json?
  status        LeadStatus     @default(NEW)
  listId        String
  list          LeadList       @relation(fields: [listId], references: [id])
  campaignLeads CampaignLead[]
  sentEmails    SentEmail[]
  replies       Reply[]
  createdAt     DateTime       @default(now())
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
}

model Campaign {
  id            String         @id @default(cuid())
  name          String
  status        CampaignStatus @default(DRAFT)
  steps         CampaignStep[]
  campaignLeads CampaignLead[]
  createdAt     DateTime       @default(now())
}

model CampaignStep {
  id         String   @id @default(cuid())
  campaignId String
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  stepOrder  Int
  delayDays  Int
  subject    String
  body       String
}

enum CampaignLeadStatus {
  ACTIVE
  REPLIED
  COMPLETED
  STOPPED
  BOUNCED
}

model CampaignLead {
  id            String             @id @default(cuid())
  campaignId    String
  campaign      Campaign           @relation(fields: [campaignId], references: [id])
  leadId        String
  lead          Lead               @relation(fields: [leadId], references: [id])
  currentStep   Int                @default(0)
  nextSendAt    DateTime?
  status        CampaignLeadStatus @default(ACTIVE)
  lastMessageId String?

  @@unique([campaignId, leadId])
}

model SentEmail {
  id         String       @id @default(cuid())
  leadId     String
  lead       Lead         @relation(fields: [leadId], references: [id])
  accountId  String
  account    EmailAccount @relation(fields: [accountId], references: [id])
  campaignId String?
  stepOrder  Int?
  subject    String
  messageId  String       @unique
  sentAt     DateTime     @default(now())
  opened     Boolean      @default(false)
  bounced    Boolean      @default(false)
}

model Reply {
  id         String       @id @default(cuid())
  leadId     String
  lead       Lead         @relation(fields: [leadId], references: [id])
  accountId  String
  account    EmailAccount @relation(fields: [accountId], references: [id])
  receivedAt DateTime     @default(now())
  snippet    String?
  body       String?
  category   String?
}
```

## Features, in build order

### Phase 1 — core pipeline (get this fully working before touching Phase 2)
1. **Login gate** — single password from `APP_PASSWORD`, sets an httpOnly cookie via middleware.
2. **Leads**
   - CSV upload page: parse with papaparse, map columns to fields, dedupe against existing leads by email, insert under a `LeadList`.
   - Leads table with status filter.
3. **Email accounts**
   - Form to add an account: email + SMTP host/port/user/pass + IMAP host/port/user/pass + daily limit.
   - Encrypt SMTP/IMAP passwords before storing (AES-256-GCM using `ENCRYPTION_KEY`, Node's built-in `crypto` module).
   - "Test connection" button — attempts an SMTP login and an IMAP login, reports success/failure.
4. **Campaigns**
   - Create a campaign: name + ordered steps (subject, body with `{{firstName}}` / `{{company}}` tokens, delay in days from the previous step).
   - Attach a `LeadList` to a campaign → creates one `CampaignLead` per lead, status `ACTIVE`, `nextSendAt` = now for step 0.
5. **Worker — sender loop** (runs every few minutes)
   - For each `EmailAccount` with `sentToday < dailyLimit`: pick the next due `CampaignLead` (`nextSendAt <= now`, `status = ACTIVE`), render the template, send via Nodemailer with that account's SMTP creds, log a `SentEmail` row (store the `Message-ID` header it returns), increment `sentToday`, set `nextSendAt` for the next step (or mark `COMPLETED` if the sequence is done).
   - Reset `sentToday` to 0 per account once a day (compare `lastResetDate` to today).
   - Don't send faster than roughly one email per 30–60 seconds per account, even within the daily limit — bursty sending reads as robotic.
6. **Worker — reply poller loop** (runs every few minutes)
   - Connects via IMAP to each account, checks for new messages since the last check.
   - Matches an incoming message to a lead by the `From` address (and/or `In-Reply-To` matching a stored `messageId`).
   - On match: insert a `Reply` row, set the `Lead.status` to `REPLIED`, set the matching `CampaignLead.status` to `REPLIED` — the sender loop must only ever pick up `CampaignLead`s with `status = ACTIVE`, so this is what actually stops the follow-ups.
7. **Dashboard** — total leads, emails sent today/all-time, replies, bounces, a per-campaign breakdown.

### Phase 2 — automation polish
- Round-robin account selection in the sender (rotate across accounts instead of draining account 1 first).
- Business-hours send window (e.g. only send 9am–6pm IST) before attempting full per-lead timezone awareness.
- Unsubscribe link + endpoint — one click sets `Lead.status = UNSUBSCRIBED` and stops their sequence.
- Bounce handling — catch SMTP 5xx errors on send, or detect bounce-pattern senders (mailer-daemon, postmaster) via IMAP — mark `SentEmail.bounced` and suppress the lead from future campaigns.
- AI reply categorization — send the reply snippet to an LLM, classify as interested / not_interested / ooo / wrong_person, store on `Reply.category`.

### Phase 3 — nice to have
- Open tracking pixel.
- Click tracking (wrap links, redirect through your own domain).
- Subject-line A/B testing.
- Per-lead notes and manual reminders.

## Key implementation notes
- **Threading follow-ups**: set `inReplyTo` and `references` on the Nodemailer call to the previous step's `messageId`, so replies land in the same thread — this gets meaningfully better reply rates than a fresh email each time.
  ```js
  await transporter.sendMail({
    from: account.email,
    to: lead.email,
    subject: step.subject,
    html: renderedBody,
    inReplyTo: previousMessageId,
    references: previousMessageId,
  });
  ```
- Never log or return decrypted SMTP/IMAP passwords to the client — the UI should only ever show "•••• configured".
- The sender and poller must run as background loops inside the worker process — not inside Next.js API routes, which don't run when nothing is requesting them.
- Skip auto-ramping warm-up logic for Phase 1 — just set conservative `dailyLimit` values per account manually (see numbers below) and raise them by hand over the first couple of weeks.
- Test Phase 1 end-to-end (upload → send → reply detected) against 2–3 of your own addresses before pointing it at the real 1,000 leads.

## Common SMTP/IMAP settings for custom-domain mail
Confirm exact values in each provider's mail client setup docs, but as a starting point:
| Provider | SMTP | IMAP |
|---|---|---|
| Zoho Mail | smtp.zoho.com : 587 (STARTTLS) | imap.zoho.com : 993 |
| GoDaddy Workspace Email | smtpout.secureserver.net : 587 or 465 | imap.secureserver.net : 993 |

If any of the 3 accounts is actually GoDaddy-hosted Microsoft 365 rather than legacy Workspace Email, its SMTP/IMAP settings follow Outlook's, not the table above — worth a quick check before wiring it up.

## Deployment
1. **Database** — create a Supabase project, put its connection string in `DATABASE_URL`, run `npx prisma migrate deploy` once against it.
2. **Web app (Vercel)** — connect the repo, set `DATABASE_URL` / `APP_PASSWORD` / `ENCRYPTION_KEY`, deploy. Serves the dashboard + API routes.
3. **Worker (Railway)** — new service from the same repo, start command `npm run worker` (add `"worker": "tsx worker/index.ts"` to package.json scripts), same env vars. Runs the sender + poller continuously.

## Suggested prompting order in Cursor
Don't paste this whole file and ask for everything at once — feed it in chunks and get each part working before moving on:
1. "Set up the Next.js + TypeScript + Tailwind project with this Prisma schema and a Supabase connection" — paste the schema block.
2. "Build the password-gate middleware using `APP_PASSWORD`."
3. "Build the lead CSV upload flow" — paste Phase 1, point 2.
4. "Build the email account management page with encrypted credential storage" — paste Phase 1, point 3.
5. "Build the campaign builder UI and the `CampaignLead` creation logic" — paste Phase 1, point 4.
6. "Build the worker's sender loop" — paste Phase 1, point 5.
7. "Build the worker's IMAP reply poller" — paste Phase 1, point 6.
8. "Build the dashboard" — paste Phase 1, point 7.

Once all of Phase 1 works end-to-end, move through Phase 2's items the same way, one at a time.
