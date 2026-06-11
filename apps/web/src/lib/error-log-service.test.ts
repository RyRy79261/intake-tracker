/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { db, type ErrorLogEntry } from "@/lib/db";
import {
  logError,
  getErrorLogs,
  clearErrorLogs,
  exportErrorLogs,
} from "@/lib/error-log-service";

// ---------------------------------------------------------------------------
// logError
// ---------------------------------------------------------------------------

describe("logError", () => {
  it("persists an entry to the _errorLogs table", async () => {
    await logError("window-error", { message: "boom" });

    const logs = await db._errorLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.source).toBe("window-error");
    expect(logs[0]!.message).toBe("boom");
    expect(logs[0]!.id).toBeTruthy();
    expect(logs[0]!.timestamp).toBeGreaterThan(0);
  });

  it("stores stack and componentStack when provided", async () => {
    await logError("error-boundary", {
      message: "render failed",
      stack: "Error: render failed\n  at Foo",
      componentStack: "  in Foo\n  in App",
    });

    const [entry] = await db._errorLogs.toArray();
    expect(entry!.stack).toContain("at Foo");
    expect(entry!.componentStack).toContain("in App");
  });

  it("omits stack/componentStack fields entirely when not provided", async () => {
    await logError("console-warn", { message: "just a warning" });

    const [entry] = await db._errorLogs.toArray();
    expect("stack" in entry!).toBe(false);
    expect("componentStack" in entry!).toBe(false);
  });

  it("preserves an empty-string message verbatim (no placeholder substitution)", async () => {
    // truncate() only returns undefined for null/undefined input; an empty
    // string passes straight through, so the "(no message)" fallback is
    // unreachable from a "" message.
    await logError("console-error", { message: "" });

    const [entry] = await db._errorLogs.toArray();
    expect(entry!.message).toBe("");
  });

  it("truncates an over-long message to the 2000-char cap plus ellipsis", async () => {
    await logError("console-error", { message: "x".repeat(5000) });

    const [entry] = await db._errorLogs.toArray();
    // 2000 chars + the appended ellipsis
    expect(entry!.message).toHaveLength(2001);
    expect(entry!.message.endsWith("…")).toBe(true);
  });

  it("truncates an over-long stack to the 8000-char cap plus ellipsis", async () => {
    await logError("window-error", {
      message: "deep",
      stack: "y".repeat(20000),
    });

    const [entry] = await db._errorLogs.toArray();
    expect(entry!.stack).toHaveLength(8001);
  });

  it("records the route from window.location.pathname", async () => {
    window.history.pushState({}, "", "/medications");
    await logError("window-error", { message: "on meds page" });

    const [entry] = await db._errorLogs.toArray();
    expect(entry!.route).toBe("/medications");
  });

  it("trims the table back to the 500-entry cap via LRU eviction", async () => {
    // Seed 500 existing entries with ascending timestamps.
    const seed: ErrorLogEntry[] = Array.from({ length: 500 }, (_, i) => ({
      id: `seed-${i}`,
      timestamp: 1_000 + i,
      source: "console-error",
      message: `seed ${i}`,
      appVersion: "0.0.0",
    }));
    await db._errorLogs.bulkAdd(seed);

    // The 501st write should evict the single oldest entry.
    await logError("window-error", { message: "newest" });

    const count = await db._errorLogs.count();
    expect(count).toBe(500);
    // Oldest seed (timestamp 1000) is gone.
    expect(await db._errorLogs.get("seed-0")).toBeUndefined();
    // A newer seed survives.
    expect(await db._errorLogs.get("seed-499")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getErrorLogs
// ---------------------------------------------------------------------------

describe("getErrorLogs", () => {
  it("returns entries newest-first", async () => {
    await db._errorLogs.bulkAdd([
      { id: "a", timestamp: 1_000, source: "console-error", message: "a" },
      { id: "b", timestamp: 3_000, source: "console-error", message: "b" },
      { id: "c", timestamp: 2_000, source: "console-error", message: "c" },
    ]);

    const logs = await getErrorLogs();
    expect(logs.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("honors the limit argument", async () => {
    await db._errorLogs.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({
        id: `e-${i}`,
        timestamp: 1_000 + i,
        source: "console-warn" as const,
        message: `e ${i}`,
      })),
    );

    const logs = await getErrorLogs(3);
    expect(logs).toHaveLength(3);
    // Newest three.
    expect(logs.map((l) => l.id)).toEqual(["e-9", "e-8", "e-7"]);
  });

  it("returns an empty array when there are no logs", async () => {
    expect(await getErrorLogs()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearErrorLogs
// ---------------------------------------------------------------------------

describe("clearErrorLogs", () => {
  it("removes every entry from the table", async () => {
    await db._errorLogs.bulkAdd([
      { id: "x", timestamp: 1, source: "console-error", message: "x" },
      { id: "y", timestamp: 2, source: "console-error", message: "y" },
    ]);

    await clearErrorLogs();

    expect(await db._errorLogs.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// exportErrorLogs
// ---------------------------------------------------------------------------

describe("exportErrorLogs", () => {
  it("emits valid JSON with exportedAt, appVersion, and newest-first logs", async () => {
    await db._errorLogs.bulkAdd([
      { id: "old", timestamp: 1_000, source: "console-error", message: "old" },
      { id: "new", timestamp: 9_000, source: "console-error", message: "new" },
    ]);

    const parsed = JSON.parse(await exportErrorLogs());
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.appVersion).toBeTruthy();
    expect(parsed.logs.map((l: ErrorLogEntry) => l.id)).toEqual(["new", "old"]);
  });

  it("exports an empty logs array when there are no entries", async () => {
    const parsed = JSON.parse(await exportErrorLogs());
    expect(parsed.logs).toEqual([]);
  });
});
