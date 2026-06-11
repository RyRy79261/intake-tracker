import { describe, it, expect } from "vitest";
import {
  generateOpaqueToken,
  hashToken,
  hashesEqual,
  TOKEN_PREFIX,
  verifyPkceS256,
} from "@/lib/mcp/tokens";
import { createHash } from "node:crypto";

describe("mcp/tokens", () => {
  describe("generateOpaqueToken", () => {
    it("returns a string with the given prefix and high entropy", () => {
      const t = generateOpaqueToken(TOKEN_PREFIX.ACCESS, 32);
      expect(t.startsWith(`${TOKEN_PREFIX.ACCESS}_`)).toBe(true);
      // 32 bytes -> base64url is ~43 chars
      expect(t.length).toBeGreaterThan(40);
    });

    it("produces distinct values on repeated calls", () => {
      const a = generateOpaqueToken("x", 16);
      const b = generateOpaqueToken("x", 16);
      expect(a).not.toEqual(b);
    });
  });

  describe("hashToken", () => {
    it("returns a 64-char hex string (sha256)", () => {
      const h = hashToken("hello");
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
    it("is deterministic", () => {
      expect(hashToken("same")).toEqual(hashToken("same"));
    });
  });

  describe("hashesEqual", () => {
    it("returns true for matching hashes", () => {
      expect(hashesEqual(hashToken("x"), hashToken("x"))).toBe(true);
    });
    it("returns false for different hashes", () => {
      expect(hashesEqual(hashToken("x"), hashToken("y"))).toBe(false);
    });
    it("returns false for mismatched lengths", () => {
      expect(hashesEqual("a".repeat(64), "b".repeat(62))).toBe(false);
    });
  });

  describe("verifyPkceS256", () => {
    it("accepts the canonical verifier→challenge mapping", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(verifyPkceS256(verifier, challenge)).toBe(true);
    });
    it("rejects a wrong verifier", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = createHash("sha256")
        .update("different")
        .digest("base64url");
      expect(verifyPkceS256(verifier, challenge)).toBe(false);
    });
  });
});
