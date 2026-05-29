import { describe, it, expect } from "vitest";
import {
  normalizeConditions,
  MAX_CONDITIONS,
  MAX_CONDITION_LENGTH,
} from "@/lib/profile-service";

describe("profile-service normalizeConditions", () => {
  it("trims surrounding whitespace from each condition", () => {
    expect(normalizeConditions(["  Hypertension  ", "\tDiabetes\n"])).toEqual([
      "Hypertension",
      "Diabetes",
    ]);
  });

  it("drops blank and whitespace-only entries", () => {
    expect(normalizeConditions(["", "   ", "\t\n", "Asthma"])).toEqual([
      "Asthma",
    ]);
  });

  it("clamps each condition to MAX_CONDITION_LENGTH characters", () => {
    const long = "a".repeat(MAX_CONDITION_LENGTH + 50);
    const [result] = normalizeConditions([long]);
    expect(result).toHaveLength(MAX_CONDITION_LENGTH);
    expect(result).toBe("a".repeat(MAX_CONDITION_LENGTH));
  });

  it("trims BEFORE clamping (leading whitespace does not consume length budget)", () => {
    const value = "   " + "b".repeat(MAX_CONDITION_LENGTH);
    const [result] = normalizeConditions([value]);
    expect(result).toBe("b".repeat(MAX_CONDITION_LENGTH));
  });

  it("dedupes case-insensitively, keeping the first-seen casing", () => {
    expect(
      normalizeConditions(["Hypertension", "HYPERTENSION", "hypertension"]),
    ).toEqual(["Hypertension"]);
  });

  it("treats entries that differ only by surrounding whitespace as duplicates", () => {
    expect(normalizeConditions(["Asthma", "  asthma  "])).toEqual(["Asthma"]);
  });

  it("clamps the total count to MAX_CONDITIONS", () => {
    const many = Array.from({ length: MAX_CONDITIONS + 5 }, (_, i) => `cond-${i}`);
    const result = normalizeConditions(many);
    expect(result).toHaveLength(MAX_CONDITIONS);
    // Keeps the first MAX_CONDITIONS in order.
    expect(result[0]).toBe("cond-0");
    expect(result[MAX_CONDITIONS - 1]).toBe(`cond-${MAX_CONDITIONS - 1}`);
  });

  it("dedupe does not let duplicates consume cap slots", () => {
    // 5 distinct conditions, each repeated 3 times. The cap should be applied
    // to the deduped list, so all 5 distinct values survive.
    const distinct = Array.from({ length: 5 }, (_, i) => `unique-${i}`);
    const withDupes = distinct.flatMap((c) => [c, c, c]);
    expect(normalizeConditions(withDupes)).toEqual(distinct);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeConditions([])).toEqual([]);
  });

  it("stops at MAX_CONDITIONS even when more distinct values follow", () => {
    const overflow = Array.from(
      { length: MAX_CONDITIONS + 3 },
      (_, i) => `c${i}`,
    );
    const result = normalizeConditions(overflow);
    expect(result).toHaveLength(MAX_CONDITIONS);
    // The values beyond the cap are dropped entirely.
    expect(result).not.toContain(`c${MAX_CONDITIONS}`);
  });
});
