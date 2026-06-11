/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { db, type ErrorLogEntry } from "@/lib/db";
import {
  collectEnvironmentInfo,
  collectRecentErrorLogs,
  MAX_REPORT_LOGS,
  type EnvField,
} from "@/lib/bug-report";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// collectEnvironmentInfo
// ---------------------------------------------------------------------------

describe("collectEnvironmentInfo", () => {
  it("includes the standard environment fields", async () => {
    const fields = await collectEnvironmentInfo();
    const labels = fields.map((f) => f.label);

    expect(labels).toContain("App version");
    expect(labels).toContain("Build env");
    expect(labels).toContain("Mode");
    expect(labels).toContain("DB version");
    expect(labels).toContain("Device ID");
    expect(labels).toContain("Timezone");
  });

  it("reports Web mode (not Capacitor) in the jsdom test environment", async () => {
    const fields = await collectEnvironmentInfo();
    const mode = fields.find((f) => f.label === "Mode");
    expect(mode!.value).toBe("Web");
  });

  it("includes navigator-derived fields (Locale, Online, User agent)", async () => {
    const fields = await collectEnvironmentInfo();
    const labels = fields.map((f) => f.label);

    expect(labels).toContain("Locale");
    expect(labels).toContain("Online");
    expect(labels).toContain("User agent");
  });

  it("appends extra fields after the standard set, in order", async () => {
    const extra: EnvField[] = [
      { label: "AI key", value: "configured" },
      { label: "Custom", value: "yes" },
    ];
    const fields = await collectEnvironmentInfo(extra);

    const last2 = fields.slice(-2);
    expect(last2).toEqual(extra);
  });

  it("returns only the standard set when no extras are passed", async () => {
    const withExtra = await collectEnvironmentInfo([{ label: "E", value: "1" }]);
    const without = await collectEnvironmentInfo();
    expect(withExtra.length).toBe(without.length + 1);
  });

  it("skips the Storage field when navigator.storage.estimate rejects", async () => {
    if (typeof navigator !== "undefined" && "storage" in navigator) {
      vi.spyOn(navigator.storage, "estimate").mockRejectedValue(
        new Error("not supported"),
      );
    }
    const fields = await collectEnvironmentInfo();
    // estimate() rejected — the Storage field must be absent, not throw.
    expect(fields.find((f) => f.label === "Storage")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// collectRecentErrorLogs
// ---------------------------------------------------------------------------

function seedLog(overrides: Partial<ErrorLogEntry> & { id: string }): ErrorLogEntry {
  return {
    timestamp: 1_000,
    source: "console-error",
    message: "an error",
    appVersion: "0.0.0",
    ...overrides,
  };
}

describe("collectRecentErrorLogs", () => {
  it("maps stored error logs to the trimmed BugReportErrorLog shape", async () => {
    await db._errorLogs.add(
      seedLog({
        id: "log-1",
        timestamp: 5_000,
        source: "window-error",
        message: "crash",
        stack: "Error: crash",
        route: "/history",
        // userAgent / componentStack are intentionally dropped by the mapper.
        userAgent: "should-be-stripped",
      }),
    );

    const logs = await collectRecentErrorLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      timestamp: 5_000,
      source: "window-error",
      message: "crash",
      stack: "Error: crash",
      route: "/history",
    });
    expect("userAgent" in logs[0]!).toBe(false);
  });

  it("omits optional stack/route fields when absent on the source entry", async () => {
    await db._errorLogs.add(seedLog({ id: "log-2" }));

    const [log] = await collectRecentErrorLogs();
    expect("stack" in log!).toBe(false);
    expect("route" in log!).toBe(false);
  });

  it("returns logs newest-first, capped at the requested limit", async () => {
    await db._errorLogs.bulkAdd([
      seedLog({ id: "a", timestamp: 1_000 }),
      seedLog({ id: "b", timestamp: 3_000 }),
      seedLog({ id: "c", timestamp: 2_000 }),
    ]);

    const logs = await collectRecentErrorLogs(2);
    expect(logs.map((l) => l.timestamp)).toEqual([3_000, 2_000]);
  });

  it("defaults to MAX_REPORT_LOGS entries", async () => {
    await db._errorLogs.bulkAdd(
      Array.from({ length: MAX_REPORT_LOGS + 10 }, (_, i) =>
        seedLog({ id: `m-${i}`, timestamp: 1_000 + i }),
      ),
    );

    const logs = await collectRecentErrorLogs();
    expect(logs).toHaveLength(MAX_REPORT_LOGS);
  });

  it("returns an empty array when there are no error logs", async () => {
    expect(await collectRecentErrorLogs()).toEqual([]);
  });

  it("returns an empty array (best-effort) when the Dexie read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(db._errorLogs, "orderBy").mockImplementation(() => {
      throw new Error("DB unavailable");
    });

    const logs = await collectRecentErrorLogs();
    expect(logs).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
