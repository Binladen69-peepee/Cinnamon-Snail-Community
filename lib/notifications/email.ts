import type { NotificationCategory } from "@prisma/client";
import { absoluteHref, appOrigin, outsideBody } from "@/lib/notifications/content";
import { oneClickUrl, unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { PREF_ROWS } from "@/lib/notifications/preferences";

/**
 * The notification email.
 *
 * Plain on purpose: one line saying what happened, one button to go and see
 * it, and a footer that says why this arrived and how to stop it. Inline
 * styles only, because most mail clients strip everything else, and a text
 * part for the clients that do not render HTML at all.
 *
 * SYSTEM mail (billing, account) has no unsubscribe link, matching the
 * preference screen, which offers no switch for it.
 */
export type NotificationEmail = {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export function renderNotificationEmail(input: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href: string | null;
  recipientName?: string | null;
}): NotificationEmail {
  const link = absoluteHref(input.href);
  const body = outsideBody(input.category, input.body);
  const label = PREF_ROWS.find((row) => row.category === input.category)?.label;
  const optional = input.category !== "SYSTEM";
  const unsubscribe = optional ? unsubscribeUrl(input.userId, input.category) : null;
  const settings = `${appOrigin()}/settings#notifications`;
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";

  const footer = optional
    ? `You get these because ${label ? `“${label}”` : "this kind of"} email is on for your account. ` +
      `<a href="${escapeAttr(unsubscribe!)}" style="color:#6b6b6b;">Turn off these emails</a> · ` +
      `<a href="${escapeAttr(settings)}" style="color:#6b6b6b;">All notification settings</a>`
    : `This is an account notice, so it is sent regardless of your notification settings.`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f4ef;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#141414;">
<p style="margin:0 0 16px;font-size:15px;">${escapeHtml(greeting)}</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#3a3a3a;">${escapeHtml(body)}</p>
<a href="${escapeAttr(link)}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:999px;font-size:14px;font-weight:600;">Open in Vegan University</a>
<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#6b6b6b;">${footer}</p>
</div>
</body></html>`;

  const text = [
    greeting,
    "",
    input.title,
    body,
    "",
    `Open: ${link}`,
    "",
    optional
      ? `Turn off these emails: ${unsubscribe}\nAll notification settings: ${settings}`
      : "This is an account notice, so it is sent regardless of your notification settings.",
  ].join("\n");

  const headers: Record<string, string> = optional
    ? {
        "List-Unsubscribe": `<${oneClickUrl(input.userId, input.category)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};

  return { subject: input.title, html, text, headers };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
