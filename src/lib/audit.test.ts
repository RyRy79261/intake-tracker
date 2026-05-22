import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  logAudit,
  getAuditLogs,
  exportAuditLogs,
  purgeOldAuditLogs,
} from "@/lib/audit";
import { makeAuditLog } from "@/__tests__/fixtures/db-fixtures";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// logAudit — buffered write flushed after a 1s timer.
//
// The buffer flush runs `db.auditLogs.bulkAdd`, a real fake-IndexedDB
// operation that depends on internal timers; faking timers here deadlocks
// the flush. So these tests use real timers and `vi.waitFor` to observe the
// (≤1s) flush settling.
// ---------------------------------------------------------------------------

// The flush fires on a 1s timer; allow generous slack so waitFor does not
// race the timer boundary.
const WAIT = { timeout: 4000, interval: 50 } as const;

describe("logAudit", () => {
  it("flushes a buffered entry to the auditLogs table after the timer", async () => {
    logAudit("settings_change", "changed water limit");

    // Buffered — nothing written synchronously.
    expect(await db.auditLogs.count()).toBe(0);

    await vi.waitFor(async () => {
      const logs = await db.auditLogs.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.action).toBe("settings_change");
      expect(logs[0]!.details).toBe("changed water limit");
    }, WAIT);
  });

  it("batches multiple rapid calls into a single flush", async () => {
    logAudit("data_export");
    logAudit("data_import");
    logAudit("data_clear");

    await vi.waitFor(async () => {
      const logs = await db.auditLogs.toArray();
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.action).sort()).toEqual([
        "data_clear",
        "data_export",
        "data_import",
      ]);
    }, WAIT);
  });

  it("truncates details to 100 characters", async () => {
    logAudit("settings_change", "x".repeat(250));

    await vi.waitFor(async () => {
      const logs = await db.auditLogs.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.details).toHaveLength(100);
    }, WAIT);
  });

  it("omits the details field entirely when none is provided", async () => {
    logAudit("pin_verify_success");

    await vi.waitFor(async () => {
      const logs = await db.auditLogs.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.details).toBeUndefined();
    }, WAIT);
  });
});

// ---------------------------------------------------------------------------
// getAuditLogs
// ---------------------------------------------------------------------------

describe("getAuditLogs", () => {
  it("returns all entries sorted newest-first", async () => {
    await db.auditLogs.bulkAdd([
      makeAuditLog({ timestamp: 1_000 }),
      makeAuditLog({ timestamp: 3_000 }),
      makeAuditLog({ timestamp: 2_000 }),
    ]);

    const logs = await getAuditLogs();
    expect(logs.map((l) => l.timestamp)).toEqual([3_000, 2_000, 1_000]);
  });

  it("filters by startTime (inclusive lower bound)", async () => {
    await db.auditLogs.bulkAdd([
      makeAuditLog({ timestamp: 1_000 }),
      makeAuditLog({ timestamp: 5_000 }),
    ]);

    const logs = await getAuditLogs(2_000);
    expect(logs.map((l) => l.timestamp)).toEqual([5_000]);
  });

  it("filters by endTime", async () => {
    await db.auditLogs.bulkAdd([
      makeAuditLog({ timestamp: 1_000 }),
      makeAuditLog({ timestamp: 5_000 }),
    ]);

    const logs = await getAuditLogs(undefined, 2_000);
    expect(logs.map((l) => l.timestamp)).toEqual([1_000]);
  });

  it("filters by a startTime + endTime window", async () => {
    await db.auditLogs.bulkAdd([
      makeAuditLog({ timestamp: 1_000 }),
      makeAuditLog({ timestamp: 3_000 }),
      makeAuditLog({ timestamp: 9_000 }),
    ]);

    const logs = await getAuditLogs(2_000, 5_000);
    expect(logs.map((l) => l.timestamp)).toEqual([3_000]);
  });

  it("returns an empty array when there are no logs", async () => {
    expect(await getAuditLogs()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// exportAuditLogs
// ---------------------------------------------------------------------------

describe("exportAuditLogs", () => {
  it("emits valid JSON with an exportedAt stamp and the logs array", async () => {
    await db.auditLogs.add(makeAuditLog({ action: "data_export", timestamp: 2_000 }));

    const json = await exportAuditLogs();
    const parsed = JSON.parse(json);

    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.logs).toHaveLength(1);
    expect(parsed.logs[0].action).toBe("data_export");
  });

  it("exports an empty logs array when there are no entries", async () => {
    const parsed = JSON.parse(await exportAuditLogs());
    expect(parsed.logs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// purgeOldAuditLogs
// ---------------------------------------------------------------------------

describe("purgeOldAuditLogs", () => {
  it("deletes only entries older than the retention window", async () => {
    const now = Date.now();
    const old = makeAuditLog({ timestamp: now - 100 * 24 * 60 * 60 * 1000 });
    const recent = makeAuditLog({ timestamp: now - 1 * 24 * 60 * 60 * 1000 });
    await db.auditLogs.bulkAdd([old, recent]);

    const deleted = await purgeOldAuditLogs(90);
    expect(deleted).toBe(1);

    const remaining = await db.auditLogs.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(recent.id);
  });

  it("respects a custom retention threshold", async () => {
    const now = Date.now();
    await db.auditLogs.bulkAdd([
      makeAuditLog({ timestamp: now - 10 * 24 * 60 * 60 * 1000 }),
      makeAuditLog({ timestamp: now - 2 * 24 * 60 * 60 * 1000 }),
    ]);

    const deleted = await purgeOldAuditLogs(5);
    expect(deleted).toBe(1);
    expect(await db.auditLogs.count()).toBe(1);
  });

  it("returns 0 when nothing is old enough to purge", async () => {
    await db.auditLogs.add(makeAuditLog({ timestamp: Date.now() }));
    expect(await purgeOldAuditLogs(90)).toBe(0);
    expect(await db.auditLogs.count()).toBe(1);
  });
});
