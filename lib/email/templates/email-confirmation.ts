/**
 * The "add this address to your account" email.
 *
 * Same construction as the reset email (tables, inline styles, the few colour
 * literals email clients need). It says plainly what confirming does and what
 * to do if the request was not theirs: an address that confirms joins an
 * account, signs in to it, and brings any purchase made under it along.
 */
const INK = "#11231a";
const BRAND = "#1f6b46";
const PAPER = "#f3f7f0";
const ON_BRAND = "#ffffff";
const CARD = "#fbfcf8";
const LINE = "#dde6d7";
const MUTED = "#586b5e";

export function emailConfirmationSubject(): string {
  return "Confirm your email for Vegan University";
}

export function emailConfirmationText(url: string): string {
  return [
    "Confirm your email for Vegan University",
    "",
    "Someone signed in to Vegan University asked to add this address to their account. Open this link while signed in to that account to confirm it. It expires in 24 hours and works once.",
    "",
    url,
    "",
    "Did not ask for this? Ignore the email. The address is not added, and nothing bought with it moves anywhere.",
    "",
    "Vegan University",
  ].join("\n");
}

export function emailConfirmationHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confirm your email for Vegan University</title>
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
                Confirm this email
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-size:16px;line-height:1.6;color:${MUTED};">
                Someone signed in to Vegan University asked to add this address to their account. Open the link while signed in to that account to confirm it. It expires in 24 hours, and works only once.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:${BRAND};color:${ON_BRAND};font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">
                  Confirm this email
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
                Did not ask for this? Ignore the email. The address is not added, and nothing bought with it moves anywhere.
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
