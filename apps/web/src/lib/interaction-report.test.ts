import { describe, expect, it } from "vitest";
import type { Prescription } from "@intake/types/records";
import { reportHeadline, savedCautions, verdictOf } from "@/lib/interaction-report";

const rx = (genericName: string, extra: Partial<Prescription> = {}): Prescription => ({
  id: genericName,
  genericName,
  isActive: true,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  deviceId: "d",
  ...extra,
});

describe("verdictOf", () => {
  it("is avoid when any medicine is AVOID, and lists the clashes", () => {
    const v = verdictOf({
      interactions: [
        { substance: "Pseudoephedrine", medication: "Bisoprolol", severity: "AVOID", description: "x" },
        { substance: "Pseudoephedrine", medication: "Furosemide", severity: "CAUTION", description: "y" },
        { substance: "Pseudoephedrine", medication: "Spironolactone", severity: "OK", description: "z" },
      ],
      summary: "Do not take. It raises blood pressure.",
    });
    expect(v).toEqual({
      verdict: "avoid",
      line: "Do not take. It raises blood pressure.",
      clashes: ["Bisoprolol", "Furosemide"],
    });
  });

  it("falls back to a plain line when the AI gave no summary", () => {
    const v = verdictOf({
      interactions: [{ substance: "Paracetamol", medication: "Bisoprolol", severity: "OK", description: "" }],
    });
    expect(v.verdict).toBe("ok");
    expect(v.line).toBe("No important interactions were found.");
    expect(v.clashes).toEqual([]);
  });

  it("a not-assessed medicine is never OK", () => {
    const v = verdictOf({
      interactions: [
        {
          substance: "X",
          medication: "Bisoprolol",
          severity: "CAUTION",
          description: "Not assessed: the AI check returned no result for this medication.",
        },
      ],
    });
    expect(v.verdict).toBe("caution");
  });
});

describe("reportHeadline", () => {
  it("names every substance not to take", () => {
    expect(
      reportHeadline([
        { name: "Pseudoephedrine", verdict: "avoid" },
        { name: "Ibuprofen", verdict: "avoid" },
        { name: "Paracetamol", verdict: "ok" },
      ]),
    ).toBe("Do not take Pseudoephedrine or Ibuprofen");
  });

  it("never says OK when a check failed", () => {
    expect(reportHeadline([{ name: "A", verdict: "ok" }], 1)).toBe(
      "Careful. 1 could not be checked. Ask your pharmacist about it.",
    );
    expect(reportHeadline([{ name: "A", verdict: "avoid" }], 1)).toBe("Do not take A");
  });

  it("says careful, or OK", () => {
    expect(reportHeadline([{ name: "A", verdict: "caution" }])).toBe("Careful. Read each one below.");
    expect(reportHeadline([{ name: "A", verdict: "ok" }])).toBe("OK to take");
  });
});

describe("savedCautions", () => {
  it("reads About this medicine and the interaction check, once per pair", () => {
    const list = savedCautions([
      rx("Bisoprolol", {
        medicineInfo: {
          fetchedAt: 1,
          drugClass: "Beta blocker",
          compounds: [],
          warnings: [{ risk: "Alcohol drops blood pressure more.", whatToDo: "Drink less." }],
          contraindications: ["Decongestants like pseudoephedrine."],
          foodInstruction: "none",
          foodNote: "",
          pillDescription: "",
        },
        interactionCheck: {
          checkedAt: 1,
          medications: ["Spironolactone"],
          summary: "",
          rows: [{ medication: "Spironolactone", severity: "CAUTION", description: "Check potassium." }],
        },
      }),
      rx("Spironolactone", {
        interactionCheck: {
          checkedAt: 1,
          medications: ["Bisoprolol"],
          summary: "",
          rows: [{ medication: "Bisoprolol", severity: "CAUTION", description: "Check potassium." }],
        },
      }),
    ]);
    expect(list.avoid).toEqual([{ text: "Decongestants like pseudoephedrine.", from: "Bisoprolol" }]);
    expect(list.careful).toEqual([
      { text: "Alcohol drops blood pressure more. Drink less.", from: "Bisoprolol" },
      { text: "Check potassium.", from: "Bisoprolol + Spironolactone" },
    ]);
  });

  it("reads the old flat strings, without the drug class line, and skips stopped medicines", () => {
    const list = savedCautions([
      rx("Furosemide", { contraindications: ["Ibuprofen: holds water."], warnings: ["Drug class: diuretic", "Liquorice."] }),
      rx("Old", { isActive: false, contraindications: ["Never shown."] }),
    ]);
    expect(list.avoid).toEqual([{ text: "Ibuprofen: holds water.", from: "Furosemide" }]);
    expect(list.careful).toEqual([{ text: "Liquorice.", from: "Furosemide" }]);
  });
});
