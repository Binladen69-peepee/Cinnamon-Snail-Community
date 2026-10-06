import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/jobs/bulletin-posts/route";

/**
 * The daily Bulletin Board backfill is a public URL, so it is gated by the job
 * secret like every other `/api/jobs/*` route. Only the refusals are exercised
 * here: an authorised call writes posts, which the integration suite covers
 * against items it owns.
 */
describe("/api/jobs/bulletin-posts", () => {
  const saved = {
    billing: process.env.BILLING_JOB_SECRET,
    cron: process.env.CRON_SECRET,
  };

  beforeEach(() => {
    process.env.BILLING_JOB_SECRET = "bulletin-route-test-secret";
  });

  afterEach(() => {
    if (saved.billing === undefined) delete process.env.BILLING_JOB_SECRET;
    else process.env.BILLING_JOB_SECRET = saved.billing;
    if (saved.cron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved.cron;
  });

  const url = "http://localhost/api/jobs/bulletin-posts";

  it("refuses a call with no secret, by either verb", async () => {
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401);
    expect((await GET(new Request(url))).status).toBe(401);
  });

  it("refuses a call with the wrong secret", async () => {
    const response = await POST(
      new Request(url, { method: "POST", headers: { authorization: "Bearer not-the-secret" } }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authorized." });
  });
});
