# GitHub Setup Instructions — for the Cursor AI agent

> **To the AI agent (Cursor) reading this file:**
> The user wants this project put into a **brand-new GitHub repository on their own GitHub account**.
> They may be a beginner and may have nothing set up: Git may be missing, the GitHub CLI may be missing,
> and they may never have logged in to GitHub from this computer. Do the whole job from scratch, end to end,
> by running the terminal commands yourself. Go through the phases **in order**, check the result of every
> command before moving on, and explain each step to the user in one short, plain sentence.

---

## Ground rules (follow these the whole way through)

1. **Run commands yourself** in the integrated terminal. Ask the user to do something only when it really
   needs them: typing a password, approving a login in the browser, or answering a question below.
2. **Do not change any project source code.** The only job is: set up Git, connect GitHub, create the repo, push.
3. **Never commit secrets.** The files `.env`, `.env.local` and any `.env.*` (except `.env.example`) must
   never be committed. The existing `.gitignore` already handles this, but you still need to check in Phase 5.
4. **Never use `git push --force`**, and never delete or overwrite an existing GitHub repository.
5. **Never ask the user to paste a password or token into the chat.** If a token is ever needed, they type it
   only into the terminal prompt.
6. If a command needs interactive input you can't give (an arrow-key menu, a password, a browser login), tell the
   user exactly what to type or click in the terminal, wait until they say it's done, then check and carry on.
7. Work out the operating system first (Phase 0) and use the commands for that OS from then on.
   On Windows, use PowerShell syntax.

---

## Phase 0 — Check where we are

1. Work out the OS (Windows / macOS / Linux).
2. Confirm the terminal is in the **project root**, which is the folder that directly contains `package.json`,
   `prisma/`, `app/` and this file.
   - If `package.json` is not in the current folder but a subfolder named `Cold_Outreach_Automation-main`
     (or similar) contains it, `cd` into that subfolder. Then tell the user that next time they should open
     **that** folder in Cursor.
   - Never run `git init` in a folder that doesn't contain `package.json`.
3. Check whether a `.git` folder already exists here.
   - If it does, run `git status` and `git remote -v`. If a remote called `origin` already points to a GitHub
     repo, tell the user what it is and ask whether to keep it or replace it with a new repo.
     Only continue once they've answered.

---

## Phase 1 — Make sure Git is installed

Check: `git --version`

If it's missing, install it:

| OS | Command |
|---|---|
| Windows | `winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements` |
| macOS | `xcode-select --install` (opens a pop-up the user must accept). If Homebrew is installed, `brew install git` also works. |
| Linux (Debian/Ubuntu) | `sudo apt-get update && sudo apt-get install -y git` (the user may need to type their password) |

**Windows only:** after installing anything with winget, the current terminal won't see the new command yet.
Refresh PATH in the same terminal:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

If the command still isn't found, ask the user to close the terminal, open a new one (Terminal → New Terminal),
and tell you when it's done. Then run `git --version` again.

If `winget` doesn't exist on Windows, ask the user to download and run the installer from
https://git-scm.com/download/win (all default options are fine), then carry on.

---

## Phase 2 — Make sure the GitHub CLI (`gh`) is installed

The GitHub CLI handles the GitHub login and creates the repo with one command.

Check: `gh --version`

If it's missing, install it:

| OS | Command |
|---|---|
| Windows | `winget install --id GitHub.cli -e --source winget --accept-package-agreements --accept-source-agreements` (then refresh PATH as in Phase 1) |
| macOS | `brew install gh`. If Homebrew isn't installed, ask the user to download the macOS installer from https://cli.github.com and run it. |
| Linux | Follow https://github.com/cli/cli/blob/trunk/docs/install_linux.md (on Ubuntu/Debian, add the official GitHub CLI apt repo, then `sudo apt install gh`) |

If `gh` really can't be installed, skip to **Plan B** at the bottom of this file.

---

## Phase 3 — Connect the user's GitHub account

1. Check: `gh auth status`
   - If it shows the user logged in to `github.com`, tell them **which account** it is and ask:
     *"Should the repo go on this GitHub account?"* If not, run `gh auth login` again for the right account
     (or `gh auth switch` if that account is already added).
2. If they're not logged in:
   - First ask: **"Do you already have a GitHub account?"** If not, tell them to create a free one at
     https://github.com/signup and come back once it's done.
   - Then run:
     ```
     gh auth login --hostname github.com --git-protocol https --web
     ```
     This prints a **one-time code** and opens the browser. Tell the user:
     *"Copy the 8-character code shown in the terminal, paste it on the GitHub page that opened, then click
     Authorize."* If the browser doesn't open by itself, tell them to go to https://github.com/login/device.
     If the terminal asks "Authenticate Git with your GitHub credentials?", answer **Yes**.
     If the agent terminal can't handle this interactive login, ask the user to click into the terminal panel
     and run that command themselves, then tell you when it's finished.
3. Connect Git to this login so `git push` works without asking for a password:
   ```
   gh auth setup-git
   ```
4. Confirm: `gh auth status` should now say the user is logged in. Save the username:
   ```
   gh api user --jq .login
   ```

---

## Phase 4 — Set the Git identity (name and email on commits)

Check: `git config --global user.name` and `git config --global user.email`

If either one is empty:
1. Suggest using their GitHub username as the name and their **private GitHub no-reply email** as the email,
   so their personal email doesn't show up publicly. Get the no-reply email with:
   ```
   gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"'
   ```
   (On Windows PowerShell, if the quoting causes problems, run `gh api user --jq .id` and
   `gh api user --jq .login` separately and build `<id>+<login>@users.noreply.github.com` yourself.)
2. Ask the user whether that's OK, or whether they'd rather use a different name or email.
3. Set them:
   ```
   git config --global user.name "<name>"
   git config --global user.email "<email>"
   ```

---

## Phase 5 — Create the local repository and the first commit

1. If there's no `.git` folder yet:
   ```
   git init -b main
   ```
   (If the Git version is too old for `-b`, run `git init` and then `git checkout -b main`.)
2. Confirm `.gitignore` exists and contains `node_modules`, `.env` and `.next`. It already does; just check
   it hasn't been removed.
3. Stage everything: `git add -A`
4. **Safety check before committing.** Run `git status` and review the staged files:
   - No `.env` or `.env.local` file is listed (`.env.example` is fine, since it only has placeholders).
   - No `node_modules/` or `.next/` folder is listed.
   - No `*.pem`, `*.key`, `*.csv`, database dumps or other files that look like real credentials or customer data.
   - If anything like that shows up, unstage it (`git rm --cached <file>`), add it to `.gitignore`, and tell the user.
5. Commit:
   ```
   git commit -m "Initial commit: Cold Outreach Automation"
   ```

---

## Phase 6 — Create the GitHub repository and push

1. Ask the user two questions (and offer the defaults):
   - **Repository name?** Default: `cold-outreach-automation`
   - **Private or public?** Recommend **private**. This is a business tool, and a private repo can be made
     public later if wanted.
2. Create the repo, link it, and push, all in one command:
   ```
   gh repo create <repo-name> --private --source=. --remote=origin --push
   ```
   (Use `--public` instead of `--private` if the user chose public.)
3. If it fails:
   - **"Name already exists on this account"**: ask the user for a different name and try again.
     Never delete or overwrite the existing repo.
   - **"Remote origin already exists"**: show `git remote -v` to the user. If they agree, run
     `git remote remove origin` and run step 2 again.
   - **Push rejected / authentication failed**: run `gh auth status` and `gh auth setup-git` again, then
     `git push -u origin main`.

---

## Phase 7 — Check it worked and report back

1. Run `git status`. It should say the branch is up to date with `origin/main` and the working tree is clean.
2. Run `git log --oneline -1` and `git ls-remote origin main`. The commit hash should match.
3. Get the repo URL: `gh repo view --json url --jq .url`
4. Tell the user, in plain words:
   - ✅ The repository URL (they can open it in the browser to see the code).
   - Whether it's private or public.
   - How to save future changes to GitHub:
     ```
     git add -A
     git commit -m "Describe what changed"
     git push
     ```
   - A reminder: real secrets go into a local `.env` file (copy `.env.example` to `.env`), which Git
     ignores, so it will never be uploaded.

---

## Plan B — only if the GitHub CLI can't be installed

1. Do Phases 0, 1, 4 (ask the user directly for their name and email) and 5 as normal.
2. Ask the user to create an **empty** repo in the browser at https://github.com/new:
   - Choose a name (e.g. `cold-outreach-automation`) and **Private**.
   - **Don't** tick "Add a README", ".gitignore" or "license", because the repo has to start empty.
   - Click **Create repository** and paste the repo URL into the chat
     (it looks like `https://github.com/<username>/<repo>.git`).
3. Link and push:
   ```
   git remote add origin <repo-url>
   git push -u origin main
   ```
4. Signing in during the push:
   - **Windows:** Git for Windows includes Git Credential Manager, which opens a browser window to sign in to
     GitHub. Tell the user to complete it.
   - **macOS/Linux:** if Git asks for a username and password, the password must be a **Personal Access Token**,
     not the GitHub password. Have the user create one at https://github.com/settings/tokens?type=beta
     (Fine-grained token → access to the new repo → **Contents: Read and write**), then paste it **into the
     terminal prompt only, never into the chat**.
5. Finish with Phase 7 (skip the `gh` commands; the repo URL is the one the user gave you).
