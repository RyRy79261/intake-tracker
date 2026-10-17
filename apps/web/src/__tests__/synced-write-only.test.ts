/**
 * Synced tables are changed only through the synced-write module
 * (lib/synced-write.ts), which stamps, queues with the right op, retires
 * tombstones and schedules the push. A direct Dexie write or a hand-picked
 * queue op elsewhere is how a change used to stay on the device, or reach the
 * server as the wrong op.
 *
 * Static scan of the source; the exceptions below are deliberate.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

/** Files allowed to bypass the module, and why. */
const ALLOWED: Record<string, string> = {
  "lib/synced-write.ts": "the module itself",
  "lib/sync-queue.ts": "the queue primitives the module uses",
  "lib/sync-engine.ts": "applies pulled rows and server acks; never a local edit",
  "lib/db.ts": "frozen Dexie upgrade hooks",
  "lib/insight-report-service.ts":
    "caches a deep report the server already holds; queueing it would push it back",
  "lib/audit.ts": "local retention purge of audit rows (not called by the app)",
  "components/debug-panel.tsx": "Debug panel: clear the local audit log",
  // Still on writeWithSync; the estimate-tracker refactor replaces both.
  "lib/urination-service.ts": "not yet moved",
  "lib/defecation-service.ts": "not yet moved",
};

const SYNCED_TABLES = [
  "intakeRecords", "weightRecords", "bloodPressureRecords", "eatingRecords",
  "urinationRecords", "defecationRecords", "substanceRecords", "prescriptions",
  "medicationPhases", "phaseSchedules", "inventoryItems", "inventoryTransactions",
  "doseLogs", "dailyNotes", "titrationPlans", "auditLogs", "userProfile",
  "insightReports", "userSettings",
];

const DIRECT_WRITE = new RegExp(
  `db\\.(?:${SYNCED_TABLES.join("|")})\\s*\\.\\s*(?:add|put|update|bulkAdd|bulkPut|bulkUpdate|delete|bulkDelete|clear)\\(`,
);
const QUEUE_CALL = /\b(?:enqueueInsideTx|writeWithSync|enqueue)\s*\(|\bschedulePush\s*\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|bench)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("synced tables are written only through syncedWrite", () => {
  it("no file outside the allowed list writes a synced table or the queue directly", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (rel in ALLOWED) continue;
      const text = fs.readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (DIRECT_WRITE.test(line) || QUEUE_CALL.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, "Use syncedWrite (lib/synced-write.ts) for these writes").toEqual([]);
  });

  it("every allowed file still exists", () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(fs.existsSync(path.join(SRC, rel)), rel).toBe(true);
    }
  });
});
