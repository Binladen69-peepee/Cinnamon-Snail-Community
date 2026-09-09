import { magicLinkHtml, magicLinkSubject, magicLinkText } from "@/lib/email/templates/magic-link";
import { maskEmail } from "@/lib/auth/tokens";

export type SendMagicLinkResult = {
  delivered: boolean;
  providerId?: string;
};

type MagicLinkMessage = {
  to: string;
  url: string;
};

const developmentInbox: MagicLinkMessage[] = [];

export function getDevelopmentInbox(): MagicLinkMessage[] {
  return [...developmentInbox];
}

export function clearDevelopmentInbox() {
  developmentInbox.length = 0;
}

const transactionalInbox: { to: string; subject: string; html: string }[] = [];

export function getTransactionalInbox() {
  return [...transactionalInbox];
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendMagicLinkResult> {
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) throw new Error(body.message || `Resend failed: ${response.status}`);
      return { delivered: true, providerId: body.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[email] Resend failed for ${maskEmail(input.to)}: ${message}`);
      if (process.env.NODE_ENV === "production") throw error;
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is unavailable");
  }
  transactionalInbox.push(input);
  console.info(`[email] development fallback to ${maskEmail(input.to)}: ${input.subject}`);
  return { delivered: false };
}

function fromAddress() {
  return process.env.EMAIL_FROM ?? "Vegan University <hello@localhost>";
}

async function sendViaResend(to: string, url: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: magicLinkSubject(),
      html: magicLinkHtml(url),
      text: magicLinkText(url),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    throw new Error(body.message || `Resend failed: ${response.status}`);
  }
  if (!body.id) {
    throw new Error("Resend accepted the request but returned no email id");
  }
  return body.id;
}

export async function sendMagicLinkEmail(
  to: string,
  url: string,
): Promise<SendMagicLinkResult> {
  if (process.env.RESEND_API_KEY) {
    try {
      const providerId = await sendViaResend(to, url);
      return { delivered: true, providerId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[magic-link] Resend delivery failed for ${maskEmail(to)}: ${message}`,
      );
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is unavailable");
  }

  developmentInbox.push({ to, url });
  console.info(
    `[magic-link] development fallback for ${maskEmail(to)}. Delivery was unavailable; link logged only as a last resort.`,
  );
  console.info(`[magic-link] fallback URL: ${url}`);
  return { delivered: false };
}
