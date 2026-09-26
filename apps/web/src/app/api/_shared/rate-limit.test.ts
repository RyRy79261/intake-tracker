/**
 * Tests for the in-process AI route rate limiter and its bucket key.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";

function requestFrom(ip: string): NextRequest {
  return new NextRequest("https://example.test/api/ai/parse", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimitKey", () => {
  it("keys an authenticated request on the user, not the spoofable IP", () => {
    expect(rateLimitKey(requestFrom("1.1.1.1"), "user-a")).toBe(
      rateLimitKey(requestFrom("2.2.2.2"), "user-a"),
    );
    expect(rateLimitKey(requestFrom("1.1.1.1"), "user-a")).not.toBe(
      rateLimitKey(requestFrom("1.1.1.1"), "user-b"),
    );
  });

  it("falls back to the IP when there is no user", () => {
    expect(rateLimitKey(requestFrom("1.1.1.1"), undefined)).toBe("ip:1.1.1.1");
  });
});

describe("createRateLimiter", () => {
  it("caps one user across rotating x-forwarded-for values", () => {
    const limiter = createRateLimiter(2);
    const ips = ["1.1.1.1", "2.2.2.2", "3.3.3.3"];
    const results = ips.map((ip) => limiter.check(rateLimitKey(requestFrom(ip), "user-a")));
    expect(results).toEqual([true, true, false]);
  });
});
