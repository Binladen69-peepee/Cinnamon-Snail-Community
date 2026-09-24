// The product palette lost its colour; the emails that carry it followed.
const FOREST = "#0a0a0a";
const CREAM = "#ffffff";
const TERRACOTTA = "#0a0a0a";
const MUTED = "#6b6b6b";
const INK = "#0a0a0a";

export function magicLinkSubject(): string {
  return "Sign in to Vegan University";
}

export function magicLinkText(url: string): string {
  return [
    "Sign in to Vegan University",
    "",
    "Use this one-time link to enter the kitchen. It expires in one hour and can be used only once.",
    "",
    url,
    "",
    "If you did not ask for this email, you can ignore it. Someone may have typed your address by mistake.",
    "",
    "Vegan University",
  ].join("\n");
}

export function magicLinkHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in to Vegan University</title>
  </head>
  <body style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CREAM};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fbfbfb;border:1px solid #e6e6e6;border-radius:24px;">
            <tr>
              <td style="padding:36px 32px 16px;font-family:Arial,Helvetica,sans-serif;color:${FOREST};font-size:15px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                Vegan University
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;font-family:Arial,sans-serif;color:${FOREST};font-size:22px;font-weight:600;">
                Sign in to Vegan University
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-family:Arial,sans-serif;color:${MUTED};font-size:16px;line-height:1.6;">
                A one-time link is ready for you. It expires in one hour. After you use it, it will not work again.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:${TERRACOTTA};color:${CREAM};font-family:Arial,sans-serif;font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">
                  Sign in to Vegan University
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;font-family:Arial,sans-serif;color:${MUTED};font-size:13px;line-height:1.6;">
                If the button does not work, paste this address into your browser:<br />
                <span style="word-break:break-all;color:${FOREST};">${safeUrl}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px;font-family:Arial,sans-serif;color:${MUTED};font-size:13px;line-height:1.6;">
                If you did not request this, ignore the email. Your account stays closed unless this link is used.
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
