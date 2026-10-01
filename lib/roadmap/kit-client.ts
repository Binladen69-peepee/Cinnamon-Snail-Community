/**
 * The slice of the Kit (ConvertKit) v3 API the roadmap sync needs.
 *
 * Same API, base URL and credentials as the billing sync in
 * `lib/billing/kit.ts` — `KIT_API_KEY` / `KIT_API_SECRET`, `KIT_API_BASE` to
 * override — so there is one Kit account configuration, not two.
 *
 * Every call reports a typed failure rather than throwing, graded the way the
 * caller needs: a transient failure (network, 429, 5xx) is worth retrying; a
 * permanent one (bad key, unknown tag) is not, because retrying only repeats
 * the refusal.
 */

export type KitSubscriber = { id: string; state: string; email: string };

export class KitApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "KitApiError";
  }

  get transient(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

export type KitClient = {
  /** The subscriber with this exact address, in whatever state Kit has them. */
  findSubscriber(email: string): Promise<KitSubscriber | null>;
  getSubscriber(id: string): Promise<KitSubscriber | null>;
  /** Field keys Kit knows, creating any of these labels that are missing. */
  ensureFields(labels: string[]): Promise<Map<string, string>>;
  updateFields(subscriberId: string, fields: Record<string, string>): Promise<void>;
  addTag(tagId: string, email: string): Promise<void>;
  removeTag(subscriberId: string, tagId: string): Promise<void>;
};

export function kitConfigured(): boolean {
  return Boolean(process.env.KIT_API_KEY && process.env.KIT_API_SECRET);
}

const TIMEOUT_MS = 10_000;

export function httpKitClient(): KitClient {
  const base = (process.env.KIT_API_BASE ?? "https://api.convertkit.com/v3").replace(/\/$/, "");
  const apiKey = process.env.KIT_API_KEY ?? "";
  const apiSecret = process.env.KIT_API_SECRET ?? "";

  async function call<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new KitApiError(
        `Kit ${method} ${path} failed: ${error instanceof Error ? error.message : "network error"}`,
        null,
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new KitApiError(`Kit ${method} ${path} HTTP ${response.status}: ${text.slice(0, 200)}`, response.status);
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  const toSubscriber = (
    row: { id?: number | string; state?: string; email_address?: string } | undefined,
  ): KitSubscriber | null =>
    row?.id !== undefined && row.email_address
      ? { id: String(row.id), state: String(row.state ?? ""), email: row.email_address }
      : null;

  return {
    async findSubscriber(email) {
      const data = await call<{ subscribers?: { id: number; email_address: string; state: string }[] }>(
        "GET",
        "/subscribers",
        undefined,
        { api_secret: apiSecret, email_address: email },
      );
      const match = data.subscribers?.find(
        (row) => row.email_address?.toLowerCase() === email.toLowerCase(),
      );
      return toSubscriber(match);
    },

    async getSubscriber(id) {
      try {
        const data = await call<{ subscriber?: { id: number; state: string; email_address: string } }>(
          "GET",
          `/subscribers/${encodeURIComponent(id)}`,
          undefined,
          { api_secret: apiSecret },
        );
        return toSubscriber(data.subscriber);
      } catch (error) {
        if (error instanceof KitApiError && error.status === 404) return null;
        throw error;
      }
    },

    async ensureFields(labels) {
      const data = await call<{ custom_fields?: { key: string; label: string }[] }>(
        "GET",
        "/custom_fields",
        undefined,
        { api_key: apiKey },
      );
      const byLabel = new Map((data.custom_fields ?? []).map((field) => [field.label, field.key]));
      for (const label of labels) {
        if (byLabel.has(label)) continue;
        const created = await call<{ key?: string; label?: string }>("POST", "/custom_fields", {
          api_secret: apiSecret,
          label,
        });
        if (created.key) byLabel.set(label, created.key);
      }
      return byLabel;
    },

    async updateFields(subscriberId, fields) {
      await call("PUT", `/subscribers/${encodeURIComponent(subscriberId)}`, {
        api_secret: apiSecret,
        fields,
      });
    },

    async addTag(tagId, email) {
      await call("POST", `/tags/${encodeURIComponent(tagId)}/subscribe`, {
        api_key: apiKey,
        api_secret: apiSecret,
        email,
      });
    },

    async removeTag(subscriberId, tagId) {
      try {
        await call(
          "DELETE",
          `/subscribers/${encodeURIComponent(subscriberId)}/tags/${encodeURIComponent(tagId)}`,
          undefined,
          { api_secret: apiSecret },
        );
      } catch (error) {
        // Already gone is the outcome we wanted.
        if (error instanceof KitApiError && error.status === 404) return;
        throw error;
      }
    },
  };
}
