import { describe, it, expect } from "vitest";
import {
  buildInteractionCheck,
  isInteractionCheckStale,
  isStoredForOtherName,
  legacyInteractionFields,
  normalizeInteractionCheck,
  normalizeMedicineInfo,
} from "@/lib/medicine-about";

describe("normalizeMedicineInfo", () => {
  it("returns null for nothing usable", () => {
    expect(normalizeMedicineInfo(undefined)).toBeNull();
    expect(normalizeMedicineInfo(null)).toBeNull();
    expect(normalizeMedicineInfo("x")).toBeNull();
    expect(normalizeMedicineInfo({ fetchedAt: "today", drugClass: "x" })).toBeNull();
    expect(normalizeMedicineInfo({ fetchedAt: 1, drugClass: "", compounds: [] })).toBeNull();
  });

  it("turns pulled nulls into empty values and drops unusable entries", () => {
    const info = normalizeMedicineInfo({
      fetchedAt: 5,
      drugClass: null,
      compounds: [
        { name: "Ramipril", drugClass: null, forText: " For BP. ", howItWorks: null, sideEffects: ["Cough", null, ""] },
        { name: null },
        null,
      ],
      warnings: [{ risk: "Swelling.", whatToDo: null }, { risk: null, whatToDo: "x" }],
      contraindications: null,
      foodInstruction: "with lunch",
      foodNote: null,
      pillDescription: null,
      visualIdentification: null,
    });
    expect(info).toEqual({
      fetchedAt: 5,
      drugClass: "",
      compounds: [{ name: "Ramipril", drugClass: "", forText: "For BP.", howItWorks: "", sideEffects: ["Cough"] }],
      warnings: [{ risk: "Swelling.", whatToDo: "" }],
      contraindications: [],
      foodInstruction: "none",
      foodNote: "",
      pillDescription: "",
    });
  });
});

describe("normalizeInteractionCheck", () => {
  it("drops bad rows, sorts AVOID → CAUTION → not assessed → OK, fills a summary", () => {
    const ix = normalizeInteractionCheck({
      checkedAt: 9,
      medications: ["A", null, "B", "C", "D"],
      summary: null,
      rows: [
        { medication: "A", severity: "OK", description: "Fine." },
        { medication: "B", severity: "CAUTION", description: "Not assessed: x", notAssessed: true },
        { medication: "C", severity: "CAUTION", description: "Care.", notAssessed: null },
        { medication: "D", severity: "AVOID", description: "No." },
        { medication: "E", severity: "MAYBE", description: "?" },
        { medication: null, severity: "OK" },
      ],
    });
    expect(ix?.medications).toEqual(["A", "B", "C", "D"]);
    expect(ix?.rows.map((r) => r.medication)).toEqual(["D", "C", "B", "A"]);
    expect(ix?.rows[1]).not.toHaveProperty("notAssessed");
    expect(ix?.summary).toMatch(/Do not take some of these together/);
  });

  it("returns null without a checked time", () => {
    expect(normalizeInteractionCheck({ medications: [], rows: [] })).toBeNull();
    expect(normalizeInteractionCheck(null)).toBeNull();
  });
});

describe("buildInteractionCheck / legacyInteractionFields", () => {
  const result = {
    interactions: [
      { medication: "Furosemide", severity: "CAUTION" as const, description: "Both lower blood pressure." },
      { medication: "Warfarin", severity: "AVOID" as const, description: "Bleeding." },
      {
        medication: "Sertraline",
        severity: "CAUTION" as const,
        description: "Not assessed: the AI check returned no result for this medication.",
      },
    ],
    drugClass: "NSAID",
  };

  it("marks Not assessed rows, sorts, and keeps the medicine list it covered", () => {
    const ix = buildInteractionCheck(result, ["Furosemide", "Warfarin", "Sertraline"], 42);
    expect(ix.checkedAt).toBe(42);
    expect(ix.medications).toEqual(["Furosemide", "Warfarin", "Sertraline"]);
    expect(ix.rows.map((r) => r.medication)).toEqual(["Warfarin", "Furosemide", "Sertraline"]);
    expect(ix.rows[2]!.notAssessed).toBe(true);
    expect(ix.summary).toMatch(/Do not take some/);
  });

  it("keeps writing the legacy flat strings", () => {
    expect(legacyInteractionFields(result)).toEqual({
      contraindications: ["Warfarin: Bleeding."],
      warnings: [
        "Drug class: NSAID",
        "Furosemide: Both lower blood pressure.",
        "Sertraline: Not assessed: the AI check returned no result for this medication.",
      ],
    });
  });
});

describe("isInteractionCheckStale", () => {
  const check = { checkedAt: 1, medications: ["Furosemide", "Bisoprolol"], summary: "", rows: [] };

  it("ignores order and case", () => {
    expect(isInteractionCheckStale(check, ["bisoprolol", "Furosemide"])).toBe(false);
  });

  it("is stale when a medicine was added or removed", () => {
    expect(isInteractionCheckStale(check, ["Furosemide"])).toBe(true);
    expect(isInteractionCheckStale(check, ["Furosemide", "Bisoprolol", "Spironolactone"])).toBe(true);
  });
});

describe("forName (the generic name an answer was made for)", () => {
  const rawInfo = { fetchedAt: 5, drugClass: "Beta blocker", compounds: [] };
  const rawCheck = { checkedAt: 9, medications: [], summary: "x", rows: [] };

  it("is kept by the normalisers, trimmed; left out when absent or unusable", () => {
    expect(normalizeMedicineInfo({ ...rawInfo, forName: " Metoprolol " })?.forName).toBe("Metoprolol");
    expect(normalizeInteractionCheck({ ...rawCheck, forName: " Metoprolol " })?.forName).toBe("Metoprolol");
    expect(normalizeMedicineInfo(rawInfo)).not.toHaveProperty("forName");
    expect(normalizeMedicineInfo({ ...rawInfo, forName: null })).not.toHaveProperty("forName");
    expect(normalizeInteractionCheck({ ...rawCheck, forName: 7 })).not.toHaveProperty("forName");
  });

  it("is stored by buildInteractionCheck when given", () => {
    expect(buildInteractionCheck({ interactions: [] }, ["A"], 1, "Metoprolol").forName).toBe("Metoprolol");
    expect(buildInteractionCheck({ interactions: [] }, ["A"], 1)).not.toHaveProperty("forName");
  });

  it("isStoredForOtherName: true only when a recorded name differs from the current one", () => {
    expect(isStoredForOtherName({ forName: "Metoprolol" }, "Metformin")).toBe(true);
    expect(isStoredForOtherName({ forName: "Metoprolol" }, " metoprolol ")).toBe(false);
    // Stored before the name was recorded: cannot tell, so not flagged.
    expect(isStoredForOtherName({}, "Metformin")).toBe(false);
    expect(isStoredForOtherName(null, "Metformin")).toBe(false);
  });
});
