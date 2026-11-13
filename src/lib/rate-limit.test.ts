import { beforeEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  clientKeyFromRequest,
  resetRateLimits,
} from "./rate-limit";

const policy = { name: "test", limit: 2, windowMs: 1_000 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit, then blocks with a retry hint", () => {
    expect(checkRateLimit(policy, "a", 0).allowed).toBe(true);
    expect(checkRateLimit(policy, "a", 100).allowed).toBe(true);
    const blocked = checkRateLimit(policy, "a", 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("tracks clients and policies independently", () => {
    checkRateLimit(policy, "a", 0);
    checkRateLimit(policy, "a", 0);
    expect(checkRateLimit(policy, "b", 0).allowed).toBe(true);
    expect(checkRateLimit({ ...policy, name: "other" }, "a", 0).allowed).toBe(true);
  });

  it("starts a fresh window after the previous one expires", () => {
    checkRateLimit(policy, "a", 0);
    checkRateLimit(policy, "a", 0);
    expect(checkRateLimit(policy, "a", 1_000).allowed).toBe(true);
  });
});

describe("clientKeyFromRequest", () => {
  it("uses the first forwarded address", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientKeyFromRequest(request)).toBe("203.0.113.5");
  });

  it("falls back to a shared key when no address is present", () => {
    expect(clientKeyFromRequest(new Request("http://localhost"))).toBe("unknown");
  });
});
