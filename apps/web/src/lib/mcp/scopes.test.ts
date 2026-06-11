import { describe, it, expect } from "vitest";
import {
  parseScopeString,
  serialiseScopes,
  hasScope,
  DEFAULT_SCOPE,
} from "@/lib/mcp/scopes";

describe("mcp/scopes", () => {
  describe("parseScopeString", () => {
    it("returns the default when input is empty or undefined", () => {
      expect(parseScopeString(undefined)).toEqual([DEFAULT_SCOPE]);
      expect(parseScopeString("")).toEqual([DEFAULT_SCOPE]);
    });
    it("filters out unsupported scopes", () => {
      expect(parseScopeString("intake-tracker:read evil:write")).toEqual([
        "intake-tracker:read",
      ]);
    });
    it("falls back to default when all scopes are unsupported", () => {
      expect(parseScopeString("evil:write something:else")).toEqual([
        DEFAULT_SCOPE,
      ]);
    });
  });

  describe("serialiseScopes", () => {
    it("space-joins scopes", () => {
      expect(serialiseScopes([DEFAULT_SCOPE])).toBe(DEFAULT_SCOPE);
    });
  });

  describe("hasScope", () => {
    it("returns true when the scope is present", () => {
      expect(hasScope("intake-tracker:read", "intake-tracker:read")).toBe(true);
    });
    it("returns false when the scope is absent", () => {
      expect(hasScope("other:read", "intake-tracker:read")).toBe(false);
    });
  });
});
