import { describe, it, expect } from "vitest";
import {
  previewDoseInPills,
  pillsToDosage,
  dosageToPills,
  unitsMatch,
  findActiveBrand,
} from "@/lib/dose-preview";
import { makeInventoryItem } from "@/__tests__/fixtures/db-fixtures";

const entresto = makeInventoryItem("rx", {
  brandName: "Entresto",
  strength: 100,
  unit: "mg",
  compounds: [
    { name: "Sacubitril", strength: 49 },
    { name: "Valsartan", strength: 51 },
  ],
});
const bisoprolol = makeInventoryItem("rx", { brandName: "Concor", strength: 5, unit: "mg" });

describe("previewDoseInPills", () => {
  it("describes a combo dose as tablets of the brand plus the per-compound split", () => {
    const p = previewDoseInPills(200, "mg", entresto);
    expect(p).toMatchObject({ pills: 2, clean: true });
    expect(p!.label).toBe("2 tablets of Entresto 49/51mg");
    expect(p!.split).toBe("98/102mg");
  });

  it("flags a summed-mg dose that isn't a whole or half tablet", () => {
    // Typing the printed "97" for a 97/103 regimen against 49/51 tablets.
    const p = previewDoseInPills(97, "mg", entresto);
    expect(p!.pills).toBe(0.97);
    expect(p!.clean).toBe(false);
    expect(p!.label).toBe("0.97 tablets of Entresto 49/51mg");
  });

  it("describes a single-compound dose", () => {
    expect(previewDoseInPills(2.5, "mg", bisoprolol)!.label).toBe("½ tablet of Concor 5mg");
    expect(previewDoseInPills(7.5, "mg", bisoprolol)!.label).toBe("1½ tablets of Concor 5mg");
  });

  it("returns null without a brand, for a non-positive dose, or on a unit mismatch", () => {
    expect(previewDoseInPills(5, "mg", undefined)).toBeNull();
    expect(previewDoseInPills(0, "mg", bisoprolol)).toBeNull();
    expect(previewDoseInPills(-5, "mg", bisoprolol)).toBeNull();
    expect(previewDoseInPills(Number.NaN, "mg", bisoprolol)).toBeNull();
    expect(previewDoseInPills(5, "mcg", bisoprolol)).toBeNull();
  });
});

describe("pill ↔ dosage conversion", () => {
  it("round-trips pills of the brand through the summed dosage", () => {
    expect(pillsToDosage(2, entresto)).toBe(200);
    expect(pillsToDosage(0.5, entresto)).toBe(50);
    expect(dosageToPills(200, entresto)).toBe(2);
    expect(dosageToPills(150, entresto)).toBe(1.5);
  });
});

describe("unitsMatch", () => {
  it("compares through the controlled unit list", () => {
    expect(unitsMatch("mg", "MG")).toBe(true);
    expect(unitsMatch("ug", "mcg")).toBe(true);
    expect(unitsMatch("mg", "mcg")).toBe(false);
    // Legacy free-text units fall back to a case-insensitive compare.
    expect(unitsMatch("puffs", "Puffs")).toBe(true);
  });
});

describe("findActiveBrand", () => {
  it("picks the live, active, unarchived item", () => {
    const archived = makeInventoryItem("rx", { isActive: true, isArchived: true });
    const deleted = makeInventoryItem("rx", { isActive: true, deletedAt: 1 });
    const spare = makeInventoryItem("rx", { isActive: false });
    expect(findActiveBrand([archived, deleted, spare, bisoprolol])).toBe(bisoprolol);
    expect(findActiveBrand([archived, deleted, spare])).toBeUndefined();
  });
});
