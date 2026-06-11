import { describe, it, expect } from "vitest";
import {
  getRecordTimestamp,
  getRecordId,
  groupRecordsByDate,
  filterRecords,
  type UnifiedRecord,
  type FilterType,
} from "@/lib/history-types";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TS = 1700000000000;

// One unified record of each kind, all sharing predictable timestamps.
const waterRec: UnifiedRecord = {
  type: "intake",
  record: makeIntakeRecord({ type: "water", amount: 250, timestamp: BASE_TS }),
};
const saltRec: UnifiedRecord = {
  type: "intake",
  record: makeIntakeRecord({ type: "salt", amount: 500, timestamp: BASE_TS }),
};
const sugarRec: UnifiedRecord = {
  type: "intake",
  record: makeIntakeRecord({ type: "sugar", amount: 20, timestamp: BASE_TS }),
};
const weightRec: UnifiedRecord = {
  type: "weight",
  record: makeWeightRecord({ timestamp: BASE_TS }),
};
const bpRec: UnifiedRecord = {
  type: "bp",
  record: makeBloodPressureRecord({ timestamp: BASE_TS }),
};
const eatingRec: UnifiedRecord = {
  type: "eating",
  record: makeEatingRecord({ timestamp: BASE_TS }),
};
const urinationRec: UnifiedRecord = {
  type: "urination",
  record: makeUrinationRecord({ timestamp: BASE_TS }),
};
const defecationRec: UnifiedRecord = {
  type: "defecation",
  record: makeDefecationRecord({ timestamp: BASE_TS }),
};
const caffeineRec: UnifiedRecord = {
  type: "caffeine",
  record: makeSubstanceRecord({ type: "caffeine", timestamp: BASE_TS }),
};
const alcoholRec: UnifiedRecord = {
  type: "alcohol",
  record: makeSubstanceRecord({ type: "alcohol", timestamp: BASE_TS }),
};

const ALL: UnifiedRecord[] = [
  waterRec,
  saltRec,
  sugarRec,
  weightRec,
  bpRec,
  eatingRec,
  urinationRec,
  defecationRec,
  caffeineRec,
  alcoholRec,
];

describe("getRecordTimestamp", () => {
  it("reads timestamp from the wrapped record regardless of variant", () => {
    expect(getRecordTimestamp(waterRec)).toBe(BASE_TS);
    expect(
      getRecordTimestamp({
        type: "weight",
        record: makeWeightRecord({ timestamp: BASE_TS + 5000 }),
      }),
    ).toBe(BASE_TS + 5000);
  });
});

describe("getRecordId", () => {
  it("returns the id of the wrapped record", () => {
    const rec = makeIntakeRecord({ id: "intake-123" });
    expect(getRecordId({ type: "intake", record: rec })).toBe("intake-123");
  });

  it("returns distinct ids for distinct records", () => {
    expect(getRecordId(waterRec)).not.toBe(getRecordId(saltRec));
  });
});

describe("groupRecordsByDate", () => {
  it("returns an empty map for no records", () => {
    expect(groupRecordsByDate([]).size).toBe(0);
  });

  it("groups records that fall on the same calendar date together", () => {
    // Anchor at local midday so a small intra-day offset cannot cross a
    // calendar boundary regardless of the runner's timezone.
    const noon = new Date(2023, 10, 14, 12, 0, 0).getTime();
    const morning: UnifiedRecord = {
      type: "intake",
      record: makeIntakeRecord({ timestamp: noon }),
    };
    const afternoon: UnifiedRecord = {
      type: "intake",
      record: makeIntakeRecord({ timestamp: noon + 2 * 60 * 60 * 1000 }),
    };
    const nextDay: UnifiedRecord = {
      type: "intake",
      record: makeIntakeRecord({ timestamp: noon + DAY_MS }),
    };

    const groups = groupRecordsByDate([morning, afternoon, nextDay]);
    expect(groups.size).toBe(2);

    const sameDayKey = new Date(noon).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    expect(groups.get(sameDayKey)).toHaveLength(2);
    expect(groups.get(sameDayKey)).toEqual([morning, afternoon]);
  });

  it("preserves insertion order of records within a date group", () => {
    const groups = groupRecordsByDate([waterRec, saltRec, sugarRec]);
    const key = [...groups.keys()][0]!;
    expect(groups.get(key)).toEqual([waterRec, saltRec, sugarRec]);
  });
});

describe("filterRecords", () => {
  it("returns all records unchanged for the 'all' filter", () => {
    expect(filterRecords(ALL, "all")).toEqual(ALL);
  });

  it("filters water intake records only", () => {
    expect(filterRecords(ALL, "water")).toEqual([waterRec]);
  });

  it("filters salt intake records only", () => {
    expect(filterRecords(ALL, "salt")).toEqual([saltRec]);
  });

  it("filters sugar intake records only", () => {
    expect(filterRecords(ALL, "sugar")).toEqual([sugarRec]);
  });

  it("filters caffeine substance records only", () => {
    expect(filterRecords(ALL, "caffeine")).toEqual([caffeineRec]);
  });

  it("filters alcohol substance records only", () => {
    expect(filterRecords(ALL, "alcohol")).toEqual([alcoholRec]);
  });

  it.each<[FilterType, UnifiedRecord]>([
    ["weight", weightRec],
    ["bp", bpRec],
    ["eating", eatingRec],
    ["urination", urinationRec],
    ["defecation", defecationRec],
  ])("filters %s records by their unified type", (filter, expected) => {
    expect(filterRecords(ALL, filter)).toEqual([expected]);
  });

  it("does not confuse intake sub-types — water filter excludes salt and sugar", () => {
    const intakeOnly = [waterRec, saltRec, sugarRec];
    expect(filterRecords(intakeOnly, "water")).toEqual([waterRec]);
    expect(filterRecords(intakeOnly, "salt")).toEqual([saltRec]);
    expect(filterRecords(intakeOnly, "sugar")).toEqual([sugarRec]);
  });

  it("returns an empty array when nothing matches the filter", () => {
    expect(filterRecords([weightRec, bpRec], "water")).toEqual([]);
  });
});
