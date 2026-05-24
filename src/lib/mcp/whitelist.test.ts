import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isEmailAllowed, getAllowedEmails } from "@/lib/mcp/whitelist";

describe("mcp/whitelist", () => {
  const originalEnv = process.env.ALLOWED_EMAILS;

  beforeEach(() => {
    delete process.env.ALLOWED_EMAILS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = originalEnv;
  });

  it("returns an empty list when ALLOWED_EMAILS is unset", () => {
    expect(getAllowedEmails()).toEqual([]);
  });

  it("parses ALLOWED_EMAILS, normalises case and trims", () => {
    process.env.ALLOWED_EMAILS = " A@B.com, c@d.com ,  ";
    expect(getAllowedEmails()).toEqual(["a@b.com", "c@d.com"]);
  });

  it("allows anyone when the whitelist is empty", () => {
    expect(isEmailAllowed("anyone@example.test")).toBe(true);
  });

  it("blocks emails not on the list", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed("bob@example.com")).toBe(false);
  });

  it("matches case-insensitively", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed("ALICE@example.com")).toBe(true);
  });

  it("blocks null/undefined emails when a whitelist is set", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
  });
});
