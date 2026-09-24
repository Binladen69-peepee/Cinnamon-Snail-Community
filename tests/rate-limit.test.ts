import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeRateLimitLocal,
  resetRateLimitForTests,
} from "@/lib/auth/rate-limit";

describe("rate limit", () => {
  beforeEach(() => resetRateLimitForTests());

  it("allows requests inside the window", () => {
    const first = consumeRateLimitLocal("login:1", 2, 1000, 0);
    const second = consumeRateLimitLocal("login:1", 2, 1000, 10);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("blocks when the limit is exceeded", () => {
    consumeRateLimitLocal("login:2", 1, 1000, 0);
    const blocked = consumeRateLimitLocal("login:2", 1, 1000, 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(990);
  });
});
