import { describe, it, expect } from "vitest";
import { classifyAuthError } from "./use-ai-fetch";

describe("classifyAuthError", () => {
  it("401 + requiresAuth → expired (re-auth flow)", () => {
    expect(classifyAuthError(401, { requiresAuth: true })).toBe("expired");
  });

  it("403 + accountUnapproved → unapproved (refresh access cache)", () => {
    expect(classifyAuthError(403, { accountUnapproved: true })).toBe(
      "unapproved"
    );
  });

  it("401 without requiresAuth flag → other (don't loop into re-auth)", () => {
    expect(classifyAuthError(401, {})).toBe("other");
    expect(classifyAuthError(401, null)).toBe("other");
  });

  it("403 without accountUnapproved flag → other", () => {
    expect(classifyAuthError(403, {})).toBe("other");
    expect(classifyAuthError(403, { requiresAuth: true })).toBe("other");
  });

  it("400 / 500 → other regardless of body shape", () => {
    expect(classifyAuthError(400, { requiresAuth: true })).toBe("other");
    expect(classifyAuthError(500, { accountUnapproved: true })).toBe("other");
  });

  it("truthy-but-not-true flag values are not accepted (strict equality)", () => {
    // Defensive: a stray "true" string or 1 shouldn't trip the auth flow.
    expect(
      classifyAuthError(401, { requiresAuth: "true" as unknown as boolean })
    ).toBe("other");
    expect(
      classifyAuthError(403, { accountUnapproved: 1 as unknown as boolean })
    ).toBe("other");
  });

  it("null body never matches", () => {
    expect(classifyAuthError(401, null)).toBe("other");
    expect(classifyAuthError(403, null)).toBe("other");
  });
});
