import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const KIT_BASE = process.env.KIT_API_BASE ?? "https://api.convertkit.com/v3";

export type KitSyncResult = {
  success: boolean;
  error?: string;
  skipped?: boolean;
};

export async function syncKitForEntitlementChange(input: {
  userId: string;
  email: string;
  tag: string | null | undefined;
  action: "grant" | "revoke";
}) {
  const payload = {
    email: input.email,
    tag: input.tag ?? null,
    action: input.action,
  };

  if (!input.tag) {
    return writeKitLog(input.userId, input.action, payload, false, "Product has no Kit tag mapped");
  }

  const apiKey = process.env.KIT_API_KEY;
  const apiSecret = process.env.KIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return writeKitLog(
      input.userId,
      `kit.${input.action}`,
      payload,
      false,
      "KIT_API_KEY or KIT_API_SECRET is not configured",
    );
  }

  try {
    const path =
      input.action === "grant"
        ? `${KIT_BASE}/tags/${encodeURIComponent(input.tag)}/subscribe`
        : `${KIT_BASE}/unsubscribe`;
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        email: input.email,
        tag: input.tag,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return writeKitLog(
        input.userId,
        `kit.${input.action}`,
        payload,
        false,
        `Kit HTTP ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    await writeAuditLog({
      actorId: input.userId,
      action: `kit.${input.action}`,
      targetType: "user",
      targetId: input.userId,
      metadata: { tag: input.tag },
    });
    return writeKitLog(input.userId, `kit.${input.action}`, payload, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kit request failed";
    return writeKitLog(input.userId, `kit.${input.action}`, payload, false, message);
  }
}

async function writeKitLog(
  userId: string,
  action: string,
  payload: object,
  success: boolean,
  error?: string,
): Promise<KitSyncResult> {
  await prisma.kitSyncLog.create({
    data: { userId, action, payload, success, error },
  });
  return { success, error };
}
