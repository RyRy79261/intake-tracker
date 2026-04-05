import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportToCSV, _escapeCSVField } from "./export-service";
import type { AnalyticsResult, DataPoint } from "./analytics-types";

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

    vi.doMock("./analytics-service", () => ({
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

    const mod = await import("./export-service");
    const range = { start: Date.now() - 86400000, end: Date.now() };

    await mod.exportAllRecordsCSV(range);

    // All domains return empty, so no download is triggered, but all 9 domains are fetched
    expect(mockGetRecordsByDomain).toHaveBeenCalledTimes(9);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("water", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("salt", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("weight", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("bp", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("caffeine", range);
    expect(mockGetRecordsByDomain).toHaveBeenCalledWith("alcohol", range);
  });
});
