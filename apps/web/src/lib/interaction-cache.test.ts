/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCached,
  getCachedEntry,
  setCache,
  clearCache,
  interactionCacheKey,
} from "@/lib/interaction-cache";

const TTL = 24 * 60 * 60 * 1000;

describe("interaction-cache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe("setCache + getCached", () => {
    it("round-trips a stored value (cache hit)", () => {
      setCache("ibuprofen", { severity: "moderate" });
      expect(getCached("ibuprofen")).toEqual({ severity: "moderate" });
    });

    it("returns null for an unknown key (cache miss)", () => {
      expect(getCached("never-stored")).toBeNull();
    });

    it("normalizes keys — trim and lowercase collapse to one entry", () => {
      setCache("  Aspirin  ", { severity: "low" });
      expect(getCached("aspirin")).toEqual({ severity: "low" });
      expect(getCached("ASPIRIN")).toEqual({ severity: "low" });
    });

    it("overwrites an existing entry for the same normalized key", () => {
      setCache("warfarin", { severity: "low" });
      setCache("WARFARIN", { severity: "high" });
      expect(getCached("warfarin")).toEqual({ severity: "high" });
    });

    it("stores entries under the interaction-cache: prefix", () => {
      setCache("metformin", { ok: true });
      expect(localStorage.getItem("interaction-cache:metformin")).not.toBeNull();
    });

    it("preserves complex nested data structures", () => {
      const data = { drugs: ["a", "b"], pairs: [{ x: 1 }], note: null };
      setCache("complex", data);
      expect(getCached("complex")).toEqual(data);
    });
  });

  describe("interactionCacheKey", () => {
    it("differs when the active prescriptions differ", () => {
      expect(interactionCacheKey("ibuprofen", ["bisoprolol"])).not.toBe(
        interactionCacheKey("ibuprofen", ["bisoprolol", "warfarin"]),
      );
    });

    it("ignores prescription order, case, whitespace and duplicates", () => {
      expect(interactionCacheKey(" Ibuprofen", ["Warfarin", "bisoprolol "])).toBe(
        interactionCacheKey("ibuprofen", ["bisoprolol", "warfarin", "WARFARIN"]),
      );
    });
  });

  describe("getCachedEntry", () => {
    it("returns the stored data with its write timestamp", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1234);
      setCache("ibuprofen", { v: 1 });
      expect(getCachedEntry("ibuprofen")).toEqual({ data: { v: 1 }, timestamp: 1234 });
    });
  });

  describe("TTL expiry", () => {
    it("returns the value just before the TTL boundary", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      setCache("fresh", { v: 1 });

      vi.setSystemTime(TTL - 1);
      expect(getCached("fresh")).toEqual({ v: 1 });
    });

    it("returns null and evicts the entry once the TTL is exceeded", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      setCache("stale", { v: 1 });

      vi.setSystemTime(TTL + 1);
      expect(getCached("stale")).toBeNull();
      // Expired entry is removed from storage
      expect(localStorage.getItem("interaction-cache:stale")).toBeNull();
    });
  });

  describe("error handling", () => {
    it("returns null when the stored JSON is corrupt", () => {
      localStorage.setItem("interaction-cache:bad", "{not valid json");
      expect(getCached("bad")).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("removes only interaction-cache entries, leaving other keys intact", () => {
      setCache("drug-a", { v: 1 });
      setCache("drug-b", { v: 2 });
      localStorage.setItem("unrelated-key", "keep-me");

      clearCache();

      expect(getCached("drug-a")).toBeNull();
      expect(getCached("drug-b")).toBeNull();
      expect(localStorage.getItem("unrelated-key")).toBe("keep-me");
    });

    it("is a no-op when the cache is already empty", () => {
      expect(() => clearCache()).not.toThrow();
    });
  });
});
