import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as JsPdfMod from "jspdf";
import type { AnalyticsResult, DataPoint } from "@intake/types/analytics";

// Mock jsPDF so exportToPDF's `doc.save()` is captured instead of triggering a
// real file download. The factory wraps the real implementation so autoTable
// and all PDF rendering still run for real.
const pdfSaves: Array<{ filename: string; dataUri: string }> = [];
vi.mock("jspdf", async () => {
  const actual = await vi.importActual<typeof JsPdfMod>("jspdf");
  const Real = actual.jsPDF;
  const Wrapped = function WrappedJsPDF(...args: unknown[]) {
    const Ctor = Real as unknown as new (...a: unknown[]) => InstanceType<
      typeof Real
    >;
    const inst = new Ctor(...args);
    (inst as unknown as { save: (n: string) => void }).save = (
      filename: string,
    ) => {
      pdfSaves.push({
        filename,
        dataUri: (inst as unknown as { output: (t: string) => string }).output(
          "datauristring",
        ),
      });
    };
    return inst;
  } as unknown as typeof Real;
  Wrapped.prototype = Real.prototype;
  return { ...actual, jsPDF: Wrapped };
});

import {
  exportToCSV,
  exportAllRecordsCSV,
  exportToPDF,
  _escapeCSVField,
  _buildRecentRecordsTable,
} from "@/lib/export-service";
import { format } from "date-fns";
import { logicalDaysRange } from "@intake/core/logical-day";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeSubstanceRecord,
  makeUrinationRecord,
  makeEatingRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import { toLocalDateKey } from "@/lib/date-utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TS = 1700000000000;

// Save the original URL constructor so jspdf can still use `new URL(...)`
const OriginalURL = globalThis.URL;

beforeEach(() => {
  vi.restoreAllMocks();

  // Mock document.createElement, body.appendChild/removeChild
  const mockAnchor = {
    href: "",
    download: "",
    click: vi.fn(),
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => mockAnchor),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  });

  // Extend original URL with mock static methods
  const MockURL = Object.assign(
    function UrlProxy(...args: ConstructorParameters<typeof URL>) {
      return new OriginalURL(...args);
    },
    {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
      prototype: OriginalURL.prototype,
    },
  );
  vi.stubGlobal("URL", MockURL);
});

function makeResult(dataPoints: DataPoint[]): AnalyticsResult<unknown> {
  return {
    value: null,
    unit: "test",
    period: { start: 0, end: 1000 },
    dataPoints,
  };
}

describe("escapeCSVField", () => {
  it("returns plain field unchanged", () => {
    expect(_escapeCSVField("hello")).toBe("hello");
  });

  it("wraps field with comma in quotes", () => {
    expect(_escapeCSVField("hello,world")).toBe('"hello,world"');
  });

  it("double-escapes quotes inside field", () => {
    expect(_escapeCSVField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps field with newline in quotes", () => {
    expect(_escapeCSVField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("exportToCSV", () => {
  it("produces valid CSV with headers from dataPoint keys", () => {
    const data = makeResult([
      { timestamp: 1000, value: 42, label: "test" },
      { timestamp: 2000, value: 99 },
    ]);

    exportToCSV(data, "test.csv");

    // Verify Blob was created -- check createObjectURL was called
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("text/csv;charset=utf-8;");
  });

  it("does not trigger download with empty dataPoints", () => {
    const data = makeResult([]);
    exportToCSV(data, "empty.csv");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("escapes field containing comma in CSV output", () => {
    const data = makeResult([
      { timestamp: 1000, value: 42, label: "a,b" },
    ]);

    exportToCSV(data, "test.csv");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("escapes field containing quote in CSV output", () => {
    const data = makeResult([
      { timestamp: 1000, value: 42, label: 'say "hi"' },
    ]);

    exportToCSV(data, "test.csv");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

/** Read back the Blob that was passed to URL.createObjectURL during a download. */
async function capturedCSV(): Promise<string> {
  const calls = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const blob = calls[0]![0] as Blob;
  return blob.text();
}

describe("exportToCSV content", () => {
  it("emits a header row and one row per data point", async () => {
    exportToCSV(
      makeResult([
        { timestamp: 1000, value: 42, label: "first" },
        { timestamp: 2000, value: 99, label: "second" },
      ]),
      "out.csv",
    );

    const csv = await capturedCSV();
    const lines = csv.split("\n");
    expect(lines[0]).toBe("timestamp,value,label");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("1000,42,first");
    expect(lines[2]).toBe("2000,99,second");
  });

  it("quotes a label that contains a comma", async () => {
    exportToCSV(
      makeResult([{ timestamp: 1000, value: 1, label: "a,b" }]),
      "out.csv",
    );
    const csv = await capturedCSV();
    expect(csv).toContain('"a,b"');
  });
});

describe("exportAllRecordsCSV (real Dexie data)", () => {
  it("returns without downloading when no records exist", async () => {
    await exportAllRecordsCSV({ start: BASE_TS, end: BASE_TS + DAY_MS });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  /** Lines of one "# Title" section: [header, ...rows]. */
  function section(csv: string, title: string): string[] {
    const blocks = csv.split("\n\n");
    const block = blocks.find((b) => b.startsWith(`# ${title}\n`));
    expect(block, `section "${title}"`).toBeDefined();
    return block!.split("\n").slice(1);
  }

  const WIDE = { start: BASE_TS - DAY_MS, end: BASE_TS + 5 * DAY_MS };

  it("writes one section per record type, each sorted by timestamp", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 500, timestamp: BASE_TS + DAY_MS, source: "manual" }),
      makeIntakeRecord({ type: "salt", amount: 800, timestamp: BASE_TS, source: "food:soup", note: "lunch, big" }),
    ]);
    await db.weightRecords.add(makeWeightRecord({ weight: 73.5, timestamp: BASE_TS + 2 * DAY_MS }));
    await db.substanceRecords.add(
      makeSubstanceRecord({ type: "caffeine", amountMg: 95, timestamp: BASE_TS + 3 * DAY_MS }),
    );

    await exportAllRecordsCSV(WIDE);
    const csv = await capturedCSV();

    const intake = section(csv, "Intake");
    expect(intake[0]).toBe("timestamp,local_time,type,amount,unit,source,note");
    expect(intake).toHaveLength(3);
    expect(intake[1]).toContain(`,salt,800,mg,food:soup,"lunch, big"`);
    expect(intake[2]).toContain(",water,500,ml,manual,");

    expect(section(csv, "Weight")[1]).toContain(",73.5,");
    expect(section(csv, "Caffeine and alcohol")[1]).toContain(",caffeine,95,");
  });

  it("exports every blood pressure field, not just systolic", async () => {
    await db.bloodPressureRecords.add(
      makeBloodPressureRecord({
        systolic: 142,
        diastolic: 91,
        heartRate: 70,
        position: "sitting",
        arm: "left",
        note: "after walk",
        timestamp: BASE_TS,
      }),
    );

    await exportAllRecordsCSV(WIDE);
    const bp = section(await capturedCSV(), "Blood pressure");
    expect(bp[0]).toBe(
      "timestamp,local_time,systolic,diastolic,heart_rate,irregular_heartbeat,position,arm,note",
    );
    expect(bp[1]).toMatch(/,142,91,70,[^,]*,sitting,left,after walk$/);
  });

  it("labels urination volume as an estimate and keeps meal details", async () => {
    await db.urinationRecords.add(makeUrinationRecord({ amountEstimate: "medium", timestamp: BASE_TS }));
    await db.eatingRecords.add(makeEatingRecord({ grams: 300, note: "Pasta", timestamp: BASE_TS }));

    await exportAllRecordsCSV(WIDE);
    const csv = await capturedCSV();

    const urination = section(csv, "Urination");
    expect(urination[0]).toBe("timestamp,local_time,amount_estimate,estimated_ml (not measured),note");
    expect(urination[1]).toMatch(/,medium,300,$/);

    const eating = section(csv, "Eating");
    expect(eating[0]).toBe("timestamp,local_time,grams,note");
    expect(eating[1]).toMatch(/,300,Pasta$/);
  });

  it("adds a dose log section with the medication name", async () => {
    const rx = makePrescription({ genericName: "Furosemide" });
    await db.prescriptions.add(rx);
    await db.doseLogs.add(
      makeDoseLog(rx.id, "phase-1", "sched-1", {
        scheduledDate: format(BASE_TS, "yyyy-MM-dd"),
        scheduledTime: "08:00",
        status: "taken",
        doseAmount: 40,
        doseUnit: "mg",
      }),
    );

    await exportAllRecordsCSV(WIDE);
    const doses = section(await capturedCSV(), "Dose logs");
    expect(doses[0]).toBe(
      "scheduled_date,scheduled_time,medication,status,kind,action_time,dose_amount,dose_unit,pills_consumed,pill_strength,skip_reason,rescheduled_to,note",
    );
    expect(doses[1]).toContain(",08:00,Furosemide,taken,scheduled,,40,mg,");
  });

  it("names an 'All' export from the first record, not 1970", async () => {
    await db.weightRecords.add(makeWeightRecord({ weight: 70, timestamp: BASE_TS }));
    const anchor = document.createElement("a") as unknown as { download: string };

    await exportAllRecordsCSV({ start: 0, end: BASE_TS + DAY_MS });

    expect(anchor.download).toMatch(
      new RegExp(`^health-data-${format(BASE_TS, "yyyy-MM-dd")}-`),
    );
  });
});

describe("exportAllRecordsCSV logical-day range end", () => {
  it("names and bounds the range by its last logical day, not the next calendar date", async () => {
    // A "Today" range with dayStartHour 2 runs to 01:59:59.999 the next
    // calendar morning. The filename and the dose-log dates stop at today.
    const tz = getDeviceTimezone();
    const range = logicalDaysRange(new Date(2023, 10, 20, 12).getTime(), 1, 2, tz);
    useSettingsStore.setState({ dayStartHour: 2 });
    await db.weightRecords.add(makeWeightRecord({ weight: 70, timestamp: new Date(2023, 10, 20, 9).getTime() }));
    const rx = makePrescription({ genericName: "Furosemide" });
    await db.prescriptions.add(rx);
    await db.doseLogs.add(
      makeDoseLog(rx.id, "phase-1", "sched-1", { scheduledDate: "2023-11-21", scheduledTime: "08:00" }),
    );
    const anchor = document.createElement("a") as unknown as { download: string };

    await exportAllRecordsCSV(range);

    expect(anchor.download).toBe("health-data-2023-11-20-2023-11-20.csv");
    expect(await capturedCSV()).not.toContain("# Dose logs");
  });
});

describe("PDF recent records", () => {
  it("orders rows by real time (newest first) before cutting to the newest", async () => {
    const ts = (m: number, d: number) => new Date(2026, m, d, 9).getTime();
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1, timestamp: ts(8, 9) }),
      makeIntakeRecord({ type: "water", amount: 2, timestamp: ts(8, 30) }),
      makeIntakeRecord({ type: "water", amount: 3, timestamp: ts(9, 2) }),
    ]);
    const bpRecord = makeBloodPressureRecord({ systolic: 130, diastolic: 85, timestamp: ts(8, 10) });
    delete bpRecord.heartRate;
    await db.bloodPressureRecords.add(bpRecord);

    const rows = await _buildRecentRecordsTable({ start: ts(7, 1), end: ts(10, 1) });
    expect(rows.map((r) => r[2])).toEqual(["3 ml", "2 ml", "130/85 mmHg", "1 ml"]);
    expect(rows[0]![0]).toBe("Oct 2, 09:00");
  });

  it("keeps the newest rows when a domain has more than fit", async () => {
    const base = new Date(2026, 8, 1, 9).getTime();
    await db.intakeRecords.bulkAdd(
      Array.from({ length: 15 }, (_, i) =>
        makeIntakeRecord({ type: "water", amount: i, timestamp: base + i * DAY_MS }),
      ),
    );

    const rows = await _buildRecentRecordsTable({ start: base - DAY_MS, end: base + 20 * DAY_MS });
    expect(rows[0]![2]).toBe("14 ml");
    expect(rows.at(-1)![2]).toBe("5 ml");
  });

  it("includes the year when the range crosses a year boundary", async () => {
    const ts = new Date(2026, 0, 2, 9).getTime();
    await db.intakeRecords.add(makeIntakeRecord({ type: "water", amount: 1, timestamp: ts }));
    const rows = await _buildRecentRecordsTable({
      start: new Date(2025, 11, 20).getTime(),
      end: new Date(2026, 0, 5).getTime(),
    });
    expect(rows[0]![0]).toBe("Jan 2, 2026, 09:00");
  });
});

describe("exportToPDF", () => {
  it("saves a PDF with a date-stamped filename for an empty range", async () => {
    pdfSaves.length = 0;

    await exportToPDF({ start: BASE_TS, end: BASE_TS + 7 * DAY_MS });

    expect(pdfSaves).toHaveLength(1);
    expect(pdfSaves[0]!.filename).toMatch(
      /^health-report-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(pdfSaves[0]!.dataUri.startsWith("data:application/pdf")).toBe(true);
  });

  it("generates a PDF without error when health records are seeded", async () => {
    pdfSaves.length = 0;

    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ systolic: 120, diastolic: 80, timestamp: BASE_TS }),
      makeBloodPressureRecord({
        systolic: 130,
        diastolic: 86,
        timestamp: BASE_TS + DAY_MS,
      }),
    ]);
    await db.weightRecords.add(
      makeWeightRecord({ weight: 71, timestamp: BASE_TS }),
    );
    await db.intakeRecords.add(
      makeIntakeRecord({ type: "water", amount: 600, timestamp: BASE_TS }),
    );

    await exportToPDF({ start: BASE_TS - DAY_MS, end: BASE_TS + 7 * DAY_MS });

    expect(pdfSaves).toHaveLength(1);
    expect(pdfSaves[0]!.filename).toMatch(/\.pdf$/);
    expect(pdfSaves[0]!.dataUri.startsWith("data:application/pdf")).toBe(true);
  });

  it("clamps an 'All' report to the first data point instead of walking from 1970", async () => {
    pdfSaves.length = 0;
    // Local noon: BASE_TS is 22:13 UTC, past midnight east of UTC+1, which
    // would move the report's first/last logical day in those zones.
    const noon = new Date("2023-11-14T12:00:00").getTime();
    await db.weightRecords.add(makeWeightRecord({ weight: 71, timestamp: noon }));

    // The unclamped range walks ~20 000 days of dose schedule and times out.
    await exportToPDF({ start: 0, end: noon + 7 * DAY_MS });

    expect(pdfSaves).toHaveLength(1);
    expect(pdfSaves[0]!.filename).toBe(
      `health-report-${format(noon, "yyyy-MM-dd")}-${format(noon + 7 * DAY_MS, "yyyy-MM-dd")}.pdf`,
    );
  });
});

// Owner decision (live-data-forensics#7): a scheduled dose on a past day with
// no taken/skipped log is MISSED, in the export as on the schedule screen.
describe("export: missed doses", () => {
  const daysAgoKey = (n: number) => toLocalDateKey(Date.now() - n * DAY_MS);
  const doseSection = (csv: string): string[] => {
    const block = csv.split("\n\n").find((b) => b.startsWith("# Dose logs\n"));
    expect(block, "dose log section").toBeDefined();
    return block!.split("\n").slice(1);
  };

  async function seedDailyRegimen() {
    const since = Date.now() - 10 * DAY_MS;
    const rx = makePrescription({ id: "rx-missed", genericName: "Bisoprolol", createdAt: since });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(
      makeMedicationPhase(rx.id, { id: "ph-missed", startDate: since, createdAt: since }),
    );
    await db.phaseSchedules.add(
      makePhaseSchedule("ph-missed", {
        id: "sch-missed",
        time: "08:00",
        dosage: 5,
        anchorTimezone: getDeviceTimezone(),
        createdAt: since,
      }),
    );
    return rx;
  }

  it("lists an unlogged past scheduled dose as missed, and a stale pending log as missed", async () => {
    const rx = await seedDailyRegimen();
    // Two days ago: taken. Yesterday: a leftover "pending" log (an untake).
    // Three days ago: nothing logged at all.
    await db.doseLogs.bulkAdd([
      makeDoseLog(rx.id, "ph-missed", "sch-missed", {
        id: "taken",
        scheduledDate: daysAgoKey(2),
        scheduledTime: "08:00",
        status: "taken",
      }),
      makeDoseLog(rx.id, "ph-missed", "sch-missed", {
        id: "stale",
        scheduledDate: daysAgoKey(1),
        scheduledTime: "08:00",
        status: "pending",
      }),
    ]);

    await exportAllRecordsCSV({ start: Date.now() - 3 * DAY_MS, end: Date.now() });
    const doses = doseSection(await capturedCSV());
    const rowFor = (date: string) => doses.filter((r) => r.startsWith(`${date},`));

    expect(rowFor(daysAgoKey(3))).toHaveLength(1);
    expect(rowFor(daysAgoKey(3))[0]).toContain(",08:00,Bisoprolol,missed,scheduled,");
    expect(rowFor(daysAgoKey(2))[0]).toContain(",Bisoprolol,taken,");
    expect(rowFor(daysAgoKey(1))).toHaveLength(1);
    expect(rowFor(daysAgoKey(1))[0]).toContain(",Bisoprolol,missed,");
    // Today's dose is not missed yet, and is not listed.
    expect(rowFor(daysAgoKey(0))).toHaveLength(0);
  });

  it("the PDF reports taken, skipped and missed doses", async () => {
    pdfSaves.length = 0;
    const rx = await seedDailyRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, "ph-missed", "sch-missed", {
        scheduledDate: daysAgoKey(1),
        scheduledTime: "08:00",
        status: "skipped",
      }),
    );

    await exportToPDF({ start: Date.now() - 3 * DAY_MS, end: Date.now() });
    const pdf = atob(pdfSaves[0]!.dataUri.split(",")[1]!);
    expect(pdf).toContain("Taken: 0 / 3 doses");
    // jsPDF escapes parentheses in its text operators.
    expect(pdf).toMatch(/Skipped: 1, missed \\?\(not logged\\?\): 2/);
  });
});
