import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeRateLimit,
  resetRateLimitForTests,
} from "@/lib/auth/rate-limit";

describe("rate limit", () => {
  beforeEach(() => resetRateLimitForTests());

  it("allows requests inside the window", () => {
    const first = consumeRateLimit("login:1", 2, 1000, 0);
    const second = consumeRateLimit("login:1", 2, 1000, 10);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("blocks when the limit is exceeded", () => {
    consumeRateLimit("login:2", 1, 1000, 0);
    const blocked = consumeRateLimit("login:2", 1, 1000, 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(990);
  });
});
