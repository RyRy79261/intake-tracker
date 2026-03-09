import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IntakeRecord, WeightRecord, BloodPressureRecord, UrinationRecord, SubstanceRecord } from "./db";
import type { DoseSlot } from "./dose-schedule-service";
import type { TimeRange } from "./analytics-types";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock("./intake-service", () => ({
  getRecordsByDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock("./health-service", () => ({
  getWeightRecordsByDateRange: vi.fn().mockResolvedValue([]),
  getBloodPressureRecordsByDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock("./urination-service", () => ({
  getUrinationRecordsByDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock("./eating-service", () => ({
  getEatingRecordsByDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock("./defecation-service", () => ({
  getDefecationRecordsByDateRange: vi.fn().mockResolvedValue([]),
}));

vi.mock("./dose-schedule-service", () => ({
  getDoseScheduleForDateRange: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./db", () => ({
  db: {
    substanceRecords: {
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
  saltVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  getRecordsByDomain,
  groupByDay,
  correlate,
} from "./analytics-service";

import { getRecordsByDateRange as mockGetIntake } from "./intake-service";
import {
  getWeightRecordsByDateRange as mockGetWeight,
  getBloodPressureRecordsByDateRange as mockGetBP,
} from "./health-service";
import { getUrinationRecordsByDateRange as mockGetUrination } from "./urination-service";
import { getDoseScheduleForDateRange as mockGetDoseSchedule } from "./dose-schedule-service";
import { db as mockDb } from "./db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const BASE_TS = new Date("2024-06-01T10:00:00Z").getTime();

function makeRange(days: number): TimeRange {
  return { start: BASE_TS, end: BASE_TS + days * DAY_MS };
}

function makeIntakeRecord(overrides: Partial<IntakeRecord> & { type: "water" | "salt"; amount: number; timestamp: number }): IntakeRecord {
  return {
    id: Math.random().toString(36).slice(2),
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
    ...overrides,
  };
}

function makeWeightRecord(weight: number, timestamp: number): WeightRecord {
  return {
    id: Math.random().toString(36).slice(2),
    weight,
    timestamp,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
  };
}

function makeBPRecord(systolic: number, diastolic: number, timestamp: number): BloodPressureRecord {
  return {
    id: Math.random().toString(36).slice(2),
    systolic,
    diastolic,
    heartRate: 72,
    position: "sitting" as const,
    arm: "left" as const,
    timestamp,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
  };
}

function makeUrinationRecord(timestamp: number, amountEstimate?: string): UrinationRecord {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp,
    ...(amountEstimate && { amountEstimate }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fluidBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct daily totals given water intake + urination records", async () => {
    const day1 = BASE_TS;
    const day2 = BASE_TS + DAY_MS;

    vi.mocked(mockGetIntake).mockResolvedValue([
      makeIntakeRecord({ type: "water", amount: 500, timestamp: day1 }),
      makeIntakeRecord({ type: "water", amount: 300, timestamp: day1 + 3_600_000 }),
      makeIntakeRecord({ type: "water", amount: 400, timestamp: day2 }),
    ]);

    vi.mocked(mockGetUrination).mockResolvedValue([
      makeUrinationRecord(day1 + 7_200_000, "medium"), // 300ml
      makeUrinationRecord(day2 + 3_600_000, "large"), // 500ml
    ]);

    const result = await fluidBalance(makeRange(3));

    expect(result.unit).toBe("ml");
    expect(result.value.daily).toHaveLength(2);

    const d1 = result.value.daily[0];
    expect(d1.intakeMl).toBe(800); // 500 + 300
    expect(d1.urinationCount).toBe(1);
    expect(d1.urinationEstimatedMl).toBe(300);
    expect(d1.balance).toBe(500); // 800 - 300

    const d2 = result.value.daily[1];
    expect(d2.intakeMl).toBe(400);
    expect(d2.urinationEstimatedMl).toBe(500);
    expect(d2.balance).toBe(-100); // 400 - 500
  });

  it("returns empty results for no data", async () => {
    vi.mocked(mockGetIntake).mockResolvedValue([]);
    vi.mocked(mockGetUrination).mockResolvedValue([]);
    const result = await fluidBalance(makeRange(7));
    expect(result.value.daily).toHaveLength(0);
    expect(result.value.avgBalance).toBe(0);
    expect(result.value.daysTotal).toBe(0);
  });
});

describe("adherenceRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes correct ratio from dose schedule", async () => {
    const map = new Map<string, DoseSlot[]>();
    const makeSlot = (status: "taken" | "missed" | "pending"): DoseSlot =>
      ({
        prescriptionId: "rx1",
        phaseId: "ph1",
        scheduleId: "s1",
        scheduledDate: "2024-06-01",
        scheduleTimeUTC: 480,
        localTime: "08:00",
        dosageMg: 10,
        unit: "mg",
        status,
        prescription: {} as DoseSlot["prescription"],
        phase: {} as DoseSlot["phase"],
        schedule: {} as DoseSlot["schedule"],
      }) as DoseSlot;

    map.set("2024-06-01", [makeSlot("taken"), makeSlot("taken"), makeSlot("missed")]);
    map.set("2024-06-02", [makeSlot("taken"), makeSlot("missed")]);

    vi.mocked(mockGetDoseSchedule).mockResolvedValue(map);

    const result = await adherenceRate(makeRange(3));
    expect(result.unit).toBe("ratio");
    expect(result.value.taken).toBe(3);
    expect(result.value.total).toBe(5);
    expect(result.value.rate).toBeCloseTo(0.6);
    expect(result.value.daily).toHaveLength(2);
  });

  it("returns rate=0 for no dose schedule", async () => {
    vi.mocked(mockGetDoseSchedule).mockResolvedValue(new Map());
    const result = await adherenceRate(makeRange(7));
    expect(result.value.rate).toBe(0);
    expect(result.value.total).toBe(0);
  });
});

describe("bpTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct trend direction for rising BP data", async () => {
    const records = [
      makeBPRecord(120, 80, BASE_TS),
      makeBPRecord(125, 82, BASE_TS + DAY_MS),
      makeBPRecord(130, 85, BASE_TS + 2 * DAY_MS),
      makeBPRecord(135, 88, BASE_TS + 3 * DAY_MS),
      makeBPRecord(140, 90, BASE_TS + 4 * DAY_MS),
    ];

    vi.mocked(mockGetBP).mockResolvedValue(records);

    const result = await bpTrend(makeRange(5));
    expect(result.unit).toBe("mmHg");
    expect(result.value.trend.systolic.direction).toBe("rising");
    expect(result.value.trend.diastolic.direction).toBe("rising");
    expect(result.value.avg.systolic).toBe(130);
    expect(result.value.avg.diastolic).toBe(85);
  });

  it("returns neutral result for empty data", async () => {
    vi.mocked(mockGetBP).mockResolvedValue([]);
    const result = await bpTrend(makeRange(7));
    expect(result.value.readings).toHaveLength(0);
    expect(result.value.trend.systolic.direction).toBe("stable");
    expect(result.value.avg.systolic).toBe(0);
  });
});

describe("weightTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct min/max/avg", async () => {
    const records = [
      makeWeightRecord(70, BASE_TS),
      makeWeightRecord(71, BASE_TS + DAY_MS),
      makeWeightRecord(69, BASE_TS + 2 * DAY_MS),
      makeWeightRecord(72, BASE_TS + 3 * DAY_MS),
    ];

    vi.mocked(mockGetWeight).mockResolvedValue(records);

    const result = await weightTrend(makeRange(4));
    expect(result.unit).toBe("kg");
    expect(result.value.min).toBe(69);
    expect(result.value.max).toBe(72);
    expect(result.value.avg).toBeCloseTo(70.5);
    expect(result.value.readings).toHaveLength(4);
  });

  it("returns neutral result for empty data", async () => {
    vi.mocked(mockGetWeight).mockResolvedValue([]);
    const result = await weightTrend(makeRange(7));
    expect(result.value.readings).toHaveLength(0);
    expect(result.value.min).toBe(0);
    expect(result.value.max).toBe(0);
    expect(result.value.avg).toBe(0);
    expect(result.value.trend.direction).toBe("stable");
  });
});

describe("saltVsWeight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies lag correctly (2-day default)", async () => {
    // Salt on days 1-7, weight on days 1-7
    const saltRecords = Array.from({ length: 7 }, (_, i) =>
      makeIntakeRecord({ type: "salt" as const, amount: 1000 + i * 200, timestamp: BASE_TS + i * DAY_MS }),
    );
    const weightRecords = Array.from({ length: 7 }, (_, i) =>
      makeWeightRecord(70 + i * 0.3, BASE_TS + i * DAY_MS),
    );

    vi.mocked(mockGetIntake).mockResolvedValue(saltRecords);
    vi.mocked(mockGetWeight).mockResolvedValue(weightRecords);

    const result = await saltVsWeight(makeRange(7));
    expect(result.unit).toBe("correlation");
    expect(result.value.lagDays).toBe(2); // default lag
    expect(typeof result.value.coefficient).toBe("number");
  });
});

describe("caffeineVsBP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correlation result", async () => {
    // Mock substance records via db mock
    const mockBetween = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: "1", type: "caffeine", amountMg: 200, timestamp: BASE_TS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
        { id: "2", type: "caffeine", amountMg: 300, timestamp: BASE_TS + DAY_MS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
        { id: "3", type: "caffeine", amountMg: 400, timestamp: BASE_TS + 2 * DAY_MS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
      ]),
    });
    vi.mocked(mockDb.substanceRecords.where).mockReturnValue({ between: mockBetween } as never);

    vi.mocked(mockGetBP).mockResolvedValue([
      makeBPRecord(120, 80, BASE_TS),
      makeBPRecord(130, 85, BASE_TS + DAY_MS),
      makeBPRecord(140, 90, BASE_TS + 2 * DAY_MS),
    ]);

    const result = await caffeineVsBP(makeRange(3));
    expect(result.unit).toBe("correlation");
    expect(typeof result.value.coefficient).toBe("number");
  });
});

describe("alcoholVsBP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correlation result", async () => {
    const mockBetween = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: "1", type: "alcohol", amountStandardDrinks: 1, timestamp: BASE_TS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
        { id: "2", type: "alcohol", amountStandardDrinks: 2, timestamp: BASE_TS + DAY_MS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
        { id: "3", type: "alcohol", amountStandardDrinks: 3, timestamp: BASE_TS + 2 * DAY_MS, createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: "test" },
      ]),
    });
    vi.mocked(mockDb.substanceRecords.where).mockReturnValue({ between: mockBetween } as never);

    vi.mocked(mockGetBP).mockResolvedValue([
      makeBPRecord(120, 80, BASE_TS),
      makeBPRecord(130, 85, BASE_TS + DAY_MS),
      makeBPRecord(140, 90, BASE_TS + 2 * DAY_MS),
    ]);

    const result = await alcoholVsBP(makeRange(3));
    expect(result.unit).toBe("correlation");
    expect(typeof result.value.coefficient).toBe("number");
  });
});

describe("JSON serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all results are JSON-serializable", async () => {
    // Use empty data (mocks return [])
    const range = makeRange(7);

    const results = await Promise.all([
      fluidBalance(range),
      adherenceRate(range),
      bpTrend(range),
      weightTrend(range),
    ]);

    for (const result of results) {
      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized).toEqual(result);
    }
  });
});

describe("building blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groupByDay groups correctly by calendar date", () => {
    const base = new Date("2024-06-01T10:00:00Z").getTime();
    const points = [
      { timestamp: base, value: 100 },
      { timestamp: base + 3_600_000, value: 200 }, // same day
      { timestamp: base + DAY_MS, value: 300 }, // next day
    ];

    const grouped = groupByDay(points);
    expect(grouped.size).toBe(2);
    expect(grouped.get("2024-06-01")).toHaveLength(2);
    expect(grouped.get("2024-06-02")).toHaveLength(1);
  });

  it("getRecordsByDomain returns DataPoint[] for water domain", async () => {
    vi.mocked(mockGetIntake).mockResolvedValue([
      makeIntakeRecord({ type: "water", amount: 500, timestamp: BASE_TS }),
    ]);

    const points = await getRecordsByDomain("water", makeRange(1));
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(500);
  });
});
