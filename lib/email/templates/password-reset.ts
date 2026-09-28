/**
 * The reset email.
 *
 * Ink on paper, with the brand green on the one button, and built from tables
 * and inline styles because email clients are not browsers -- an email cannot
 * read our CSS variables, so these few literals are the one place in the
 * product where a colour is allowed to be written down twice.
 * It states the expiry and what to do if the request was not theirs, because a
 * reset email arriving unbidden is the first sign of an attempted takeover.
 */
const INK = "#11231a";
const BRAND = "#1f6b46";
const PAPER = "#f3f7f0";
const ON_BRAND = "#ffffff";
const CARD = "#fbfcf8";
const LINE = "#dde6d7";
const MUTED = "#586b5e";

export function passwordResetSubject(): string {
  return "Reset your Vegan University password";
}

export function passwordResetText(url: string): string {
  return [
    "Reset your Vegan University password",
    "",
    "Use this one-time link to choose a new password. It expires in one hour and can be used only once.",
    "",
    url,
    "",
    "If you did not ask to reset your password, ignore this email. Your password stays as it is, and signing in is unaffected.",
    "",
    "Vegan University",
  ].join("\n");
}

export function passwordResetHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset your Vegan University password</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPER};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAPER};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:20px;">
            <tr>
              <td style="padding:36px 32px 12px;font-size:15px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK};">
                Vegan University
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 10px;font-size:22px;font-weight:700;color:${INK};">
                Reset your password
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-size:16px;line-height:1.6;color:${MUTED};">
                Choose a new password with the link below. It expires in one hour, and works only once.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:${BRAND};color:${ON_BRAND};font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">
                  Choose a new password
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;font-size:13px;line-height:1.6;color:${MUTED};">
                If the button does not work, paste this address into your browser:<br />
                <span style="word-break:break-all;color:${INK};">${safeUrl}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px;font-size:13px;line-height:1.6;color:${MUTED};">
                Did not ask for this? Ignore the email. Your password is unchanged, and nobody can reset it without this link.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
