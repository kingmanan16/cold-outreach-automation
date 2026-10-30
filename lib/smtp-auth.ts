import { decrypt } from "@/lib/encryption";

type AccountAuth = {
  email: string;
  smtpUser: string;
  smtpPassEnc: string;
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
};

/** Build nodemailer auth — OAuth2 when Google tokens exist, else password. */
export function buildSmtpAuth(account: AccountAuth) {
  if (account.oauthProvider === "google" && account.oauthAccessEnc) {
    return {
      type: "OAuth2" as const,
      user: account.smtpUser || account.email,
      accessToken: decrypt(account.oauthAccessEnc),
    };
  }
  return {
    user: account.smtpUser,
    pass: decrypt(account.smtpPassEnc),
  };
}
