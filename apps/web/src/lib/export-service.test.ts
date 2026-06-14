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
} from "@/lib/export-service";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";

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

describe("exportAllRecordsCSV", () => {
  it("fetches from all domains", async () => {
    // Use dynamic import with fresh mock to avoid cached module
    vi.resetModules();

    const mockGetRecordsByDomain = vi.fn().mockResolvedValue([]);

    vi.doMock("@/lib/analytics-service", () => ({
      getRecordsByDomain: mockGetRecordsByDomain,
      fluidBalance: vi.fn(),
      adherenceRate: vi.fn(),
      bpTrend: vi.fn(),
      weightTrend: vi.fn(),
    }));

    // Re-stub globals after resetModules (preserve URL constructor for jspdf)
    const MockURL2 = Object.assign(
      function UrlProxy(...args: ConstructorParameters<typeof URL>) {
        return new OriginalURL(...args);
      },
      {
        createObjectURL: vi.fn(() => "blob:mock-url"),
        revokeObjectURL: vi.fn(),
        prototype: OriginalURL.prototype,
      },
    );
    vi.stubGlobal("URL", MockURL2);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ href: "", download: "", click: vi.fn() })),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });

    const mod = await import("@/lib/export-service");
    const range = { start: Date.now() - 86400000, end: Date.now() };

    await mod.exportAllRecordsCSV(range);

    // All domains return empty, so no download is triggered, but all 11 domains are fetched
    expect(mockGetRecordsByDomain).toHaveBeenCalledTimes(11);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("water", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("salt", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("sugar", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("potassium", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("weight", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("bp", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("caffeine", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("alcohol", range);
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

  it("includes seeded records from multiple domains, sorted by timestamp", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 500, timestamp: BASE_TS + DAY_MS }),
      makeIntakeRecord({ type: "salt", amount: 800, timestamp: BASE_TS }),
    ]);
    await db.weightRecords.add(
      makeWeightRecord({ weight: 73.5, timestamp: BASE_TS + 2 * DAY_MS }),
    );
    await db.substanceRecords.add(
      makeSubstanceRecord({ type: "caffeine", amountMg: 95, timestamp: BASE_TS + 3 * DAY_MS }),
    );

    await exportAllRecordsCSV({ start: BASE_TS - DAY_MS, end: BASE_TS + 5 * DAY_MS });

    const csv = await capturedCSV();
    const lines = csv.split("\n");
    expect(lines[0]).toBe("timestamp,domain,value,unit,note");
    expect(lines).toHaveLength(5); // header + 4 records

    // Body rows are sorted ascending by ISO timestamp.
    const bodyDomains = lines.slice(1).map((l) => l.split(",")[1]);
    expect(bodyDomains).toEqual(["salt", "water", "weight", "caffeine"]);

    expect(csv).toContain(`,salt,800,mg,`);
    expect(csv).toContain(`,water,500,ml,`);
    expect(csv).toContain(`,weight,73.5,kg,`);
    expect(csv).toContain(`,caffeine,95,mg,`);
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
});
