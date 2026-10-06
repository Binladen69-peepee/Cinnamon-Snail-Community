import { beforeEach, describe, expect, it } from "vitest";
import {
  ZoomApiError,
  clearZoomTokenCache,
  createZoomClient,
  retryDelayMs,
  type FetchLike,
} from "@/lib/zoom/client";
import { readZoomConfig, readZoomWebhookSecret } from "@/lib/zoom/config";

/**
 * The Zoom client, against a scripted fetch: no network, no clock.
 *
 * What it must get right is what keeps the sync honest and cheap: one token
 * per hour rather than one per call, every page of a long list, patience with
 * a rate limit, and "not found" reported as an answer rather than a failure.
 */

const CONFIG = {
  accountId: "acct_test",
  clientId: "client_test",
  clientSecret: "secret_test_value",
  userIds: ["me"],
};

type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fetch that answers each call from a script and records what it was asked. */
function scripted(
  handler: (call: Call, index: number) => Response | Promise<Response>,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
}

const isToken = (call: Call) => call.url.startsWith("https://zoom.us/oauth/token");

beforeEach(() => {
  clearZoomTokenCache();
});

describe("configuration", () => {
  it("is off until all three credentials are set", () => {
    expect(readZoomConfig({})).toBeNull();
    expect(readZoomConfig({ ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b" })).toBeNull();
    expect(
      readZoomConfig({ ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b", ZOOM_CLIENT_SECRET: "  " }),
    ).toBeNull();
  });

  it("reads whose meetings to sync, defaulting to the app's own user", () => {
    const base = { ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b", ZOOM_CLIENT_SECRET: "c" };
    expect(readZoomConfig(base)?.userIds).toEqual(["me"]);
    expect(
      readZoomConfig({ ...base, ZOOM_USER_IDS: "adam@example.test, host2@example.test,adam@example.test" })
        ?.userIds,
    ).toEqual(["adam@example.test", "host2@example.test"]);
  });

  it("treats the webhook as optional", () => {
    expect(readZoomWebhookSecret({})).toBeNull();
    expect(readZoomWebhookSecret({ ZOOM_WEBHOOK_SECRET_TOKEN: "tok" })).toBe("tok");
  });
});

describe("Server-to-Server OAuth", () => {
  it("asks for an account_credentials token with Basic auth", async () => {
    const { fetch, calls } = scripted((call) =>
      isToken(call)
        ? json({ access_token: "tok-1", expires_in: 3599 })
        : json({ id: "me", email: "adam@example.test" }),
    );
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    await client.getUser("me");

    const token = calls[0]!;
    const url = new URL(token.url);
    expect(url.searchParams.get("grant_type")).toBe("account_credentials");
    expect(url.searchParams.get("account_id")).toBe("acct_test");
    expect(token.init?.method).toBe("POST");
    const auth = (token.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("client_test:secret_test_value").toString("base64")}`);

    const api = calls[1]!;
    expect(api.url).toBe("https://api.zoom.us/v2/users/me");
    expect((api.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("caches the token until shortly before it expires", async () => {
    let clock = 1_000_000;
    let minted = 0;
    const { fetch, calls } = scripted((call) => {
      if (isToken(call)) {
        minted += 1;
        return json({ access_token: `tok-${minted}`, expires_in: 3600 });
      }
      return json({ id: "me" });
    });
    const client = createZoomClient({ config: CONFIG, fetch, now: () => clock, sleep: async () => {} });

    await client.getUser("me");
    await client.getUser("me");
    await client.getUser("me");
    expect(calls.filter(isToken)).toHaveLength(1);

    // Still inside the hour, but past the early-refresh margin.
    clock += 3600 * 1000 - 30_000;
    await client.getUser("me");
    expect(calls.filter(isToken)).toHaveLength(2);
    const last = calls[calls.length - 1]!;
    expect((last.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-2");
  });

  it("shares one token between clients and between concurrent calls", async () => {
    const { fetch, calls } = scripted((call) =>
      isToken(call) ? json({ access_token: "shared", expires_in: 3600 }) : json({ id: "x" }),
    );
    const first = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    const second = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    await Promise.all([first.getUser("a"), first.getUser("b"), second.getUser("c")]);
    expect(calls.filter(isToken)).toHaveLength(1);
  });

  it("mints a fresh token once when Zoom stops accepting the cached one", async () => {
    let minted = 0;
    const { fetch, calls } = scripted((call) => {
      if (isToken(call)) {
        minted += 1;
        return json({ access_token: `tok-${minted}`, expires_in: 3600 });
      }
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer tok-1"
        ? json({ code: 124, message: "Invalid access token." }, 401)
        : json({ id: "123", topic: "LIVE CLASS: Tofu" });
    });
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    const meeting = await client.getMeeting("123");
    expect(meeting?.topic).toBe("LIVE CLASS: Tofu");
    expect(calls.filter(isToken)).toHaveLength(2);
  });

  it("reports refused credentials without echoing them", async () => {
    const { fetch } = scripted(() => json({ reason: "Invalid client_id or client_secret" }, 400));
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    const error = await client.listUpcomingMeetings("me").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZoomApiError);
    expect((error as ZoomApiError).status).toBe(400);
    expect(String((error as Error).message)).not.toContain("secret_test_value");
    expect(String((error as Error).message)).not.toContain("client_test");
  });
});

describe("listing meetings", () => {
  it("asks for upcoming meetings 300 at a time and follows every page", async () => {
    const { fetch, calls } = scripted((call) => {
      if (isToken(call)) return json({ access_token: "tok", expires_in: 3600 });
      const url = new URL(call.url);
      const page = url.searchParams.get("next_page_token");
      if (!page) {
        return json({ next_page_token: "page-2", meetings: [{ id: 1, topic: "LIVE CLASS: A" }] });
      }
      if (page === "page-2") {
        return json({ next_page_token: "", meetings: [{ id: 2, topic: "Standup" }] });
      }
      return json({ meetings: [] });
    });
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    const meetings = await client.listUpcomingMeetings("adam@example.test");

    expect(meetings.map((meeting) => meeting.id)).toEqual([1, 2]);
    const api = calls.filter((call) => !isToken(call)).map((call) => new URL(call.url));
    expect(api).toHaveLength(2);
    expect(api[0]!.pathname).toBe("/v2/users/adam%40example.test/meetings");
    expect(api[0]!.searchParams.get("type")).toBe("upcoming");
    expect(api[0]!.searchParams.get("page_size")).toBe("300");
    expect(api[1]!.searchParams.get("next_page_token")).toBe("page-2");
  });
});

describe("rate limits and failures", () => {
  it("waits as long as Retry-After says, then carries on", async () => {
    const waits: number[] = [];
    const { fetch } = scripted((call, index) => {
      if (isToken(call)) return json({ access_token: "tok", expires_in: 3600 });
      return index === 1
        ? json({ code: 429, message: "Too many requests" }, 429, { "retry-after": "2" })
        : json({ meetings: [{ id: 7 }] });
    });
    const client = createZoomClient({
      config: CONFIG,
      fetch,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const meetings = await client.listUpcomingMeetings("me");
    expect(meetings).toHaveLength(1);
    expect(waits).toEqual([2000]);
  });

  it("backs off exponentially, then gives up with a typed error", async () => {
    const waits: number[] = [];
    const { fetch, calls } = scripted((call) =>
      isToken(call)
        ? json({ access_token: "tok", expires_in: 3600 })
        : json({ code: 429, message: "Too many requests" }, 429),
    );
    const client = createZoomClient({
      config: CONFIG,
      fetch,
      maxRetries: 3,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const error = await client.getMeeting("123").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZoomApiError);
    expect((error as ZoomApiError).status).toBe(429);
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(calls.filter((call) => !isToken(call))).toHaveLength(4);
  });

  it("never waits longer than ten seconds for one retry", () => {
    expect(retryDelayMs("86400", 1, 0)).toBe(10_000);
    expect(retryDelayMs(null, 10, 0)).toBe(10_000);
    expect(retryDelayMs(new Date(5_000).toUTCString(), 1, 0)).toBe(5_000);
  });

  it("retries a network failure, then reports it as one", async () => {
    let attempts = 0;
    const client = createZoomClient({
      config: CONFIG,
      fetch: async (url) => {
        if (url.startsWith("https://zoom.us/oauth/token")) {
          return json({ access_token: "tok", expires_in: 3600 });
        }
        attempts += 1;
        throw new TypeError("fetch failed");
      },
      maxRetries: 2,
      sleep: async () => {},
    });
    const error = await client.getMeeting("123").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZoomApiError);
    expect((error as ZoomApiError).status).toBe(0);
    expect(attempts).toBe(3);
  });
});

describe("one meeting", () => {
  it("returns null when Zoom says the meeting does not exist", async () => {
    const { fetch } = scripted((call) =>
      isToken(call)
        ? json({ access_token: "tok", expires_in: 3600 })
        : json({ code: 3001, message: "Meeting does not exist: 123." }, 404),
    );
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    expect(await client.getMeeting("123")).toBeNull();
  });

  it("asks for every occurrence, including the deleted and the previous", async () => {
    const { fetch, calls } = scripted((call) =>
      isToken(call) ? json({ access_token: "tok", expires_in: 3600 }) : json({ id: 123, type: 8 }),
    );
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    await client.getMeeting("123", { showPreviousOccurrences: true });
    const url = new URL(calls[1]!.url);
    expect(url.pathname).toBe("/v2/meetings/123");
    expect(url.searchParams.get("show_previous_occurrences")).toBe("true");
  });

  it("throws, rather than answering, on any other failure", async () => {
    const { fetch } = scripted((call) =>
      isToken(call)
        ? json({ access_token: "tok", expires_in: 3600 })
        : json({ code: 300, message: "Invalid meeting id." }, 400),
    );
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    await expect(client.getMeeting("123")).rejects.toBeInstanceOf(ZoomApiError);
  });

  it("goes without a host's name rather than failing", async () => {
    const { fetch } = scripted((call) =>
      isToken(call)
        ? json({ access_token: "tok", expires_in: 3600 })
        : json({ code: 4711, message: "Invalid access token, does not contain scopes." }, 400),
    );
    const client = createZoomClient({ config: CONFIG, fetch, sleep: async () => {} });
    expect(await client.getUser("me")).toBeNull();
  });
});
