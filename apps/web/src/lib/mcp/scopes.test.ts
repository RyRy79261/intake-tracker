import { describe, it, expect } from "vitest";
import {
  parseScopeString,
  serialiseScopes,
  hasScope,
  DEFAULT_SCOPES,
  READ_SCOPE,
  WRITE_SCOPE,
} from "@/lib/mcp/scopes";

describe("mcp/scopes", () => {
  describe("parseScopeString", () => {
    it("grants read and write when no scope is named", () => {
      expect(parseScopeString(undefined)).toEqual([READ_SCOPE, WRITE_SCOPE]);
      expect(parseScopeString("")).toEqual([...DEFAULT_SCOPES]);
    });
    it("grants read alone when only read is asked for", () => {
      expect(parseScopeString("intake-tracker:read")).toEqual([READ_SCOPE]);
    });
    it("filters out unsupported scopes", () => {
      expect(parseScopeString("intake-tracker:read evil:write")).toEqual([
        "intake-tracker:read",
      ]);
    });
    it("falls back to the default when all scopes are unsupported", () => {
      expect(parseScopeString("evil:write something:else")).toEqual([
        ...DEFAULT_SCOPES,
      ]);
    });
  });

  describe("serialiseScopes", () => {
    it("space-joins scopes", () => {
      expect(serialiseScopes([READ_SCOPE, WRITE_SCOPE])).toBe(
        "intake-tracker:read intake-tracker:write",
      );
    });
  });

  describe("hasScope", () => {
    it("returns true when the scope is present", () => {
      expect(hasScope("intake-tracker:read intake-tracker:write", WRITE_SCOPE)).toBe(true);
    });
    it("returns false when the scope is absent", () => {
      expect(hasScope("intake-tracker:read", WRITE_SCOPE)).toBe(false);
    });
  });
});
