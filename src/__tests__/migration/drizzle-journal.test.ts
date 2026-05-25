import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the Drizzle migration journal against the silent-skip failure mode.
 *
 * drizzle-orm's neon-http migrator applies a migration only when its journal
 * `when` exceeds the newest `created_at` already recorded in
 * `__drizzle_migrations`. If a newer entry's `when` is lower than an earlier
 * entry's, the migrator skips it on every database already past that point —
 * and still prints "Migrations applied successfully". A future-dated `when`
 * hand-edited into one entry poisons every migration generated after it.
 *
 * This test fails the build the moment that ordering breaks.
 */

const DRIZZLE_DIR = join(process.cwd(), "drizzle");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf-8"),
) as { entries: JournalEntry[] };

describe("drizzle migration journal", () => {
  it("has entries", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("entries are contiguously indexed from 0", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it("every entry's SQL file exists", () => {
    for (const entry of journal.entries) {
      expect(
        existsSync(join(DRIZZLE_DIR, `${entry.tag}.sql`)),
        `missing drizzle/${entry.tag}.sql`,
      ).toBe(true);
    }
  });

  it("`when` timestamps strictly increase with idx", () => {
    // A non-increasing `when` means the migrator silently skips the migration
    // on every database already past the prior entry — see the file header.
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1]!;
      const curr = journal.entries[i]!;
      expect(
        curr.when,
        `${curr.tag} (when=${curr.when}) must be > ${prev.tag} ` +
          `(when=${prev.when}) — otherwise drizzle's migrator skips it on ` +
          `databases already at ${prev.tag}`,
      ).toBeGreaterThan(prev.when);
    }
  });

  /**
   * `drizzle-kit generate` always stamps a new entry with a real `Date.now()`,
   * so a future-dated `when` only ever appears when `_journal.json` is
   * hand-edited. Migrations 0006–0017 carry such hand-edited future values —
   * a pre-existing wart (see commit 7935991 and CLAUDE.md "Database
   * Migrations"). Until wall-clock passes the last of them, a hand-bump on a
   * new migration is an unavoidable consequence of that mess, so this check
   * stays dormant.
   *
   * `HANDWRITTEN_CUTOFF` MUST equal the `when` of the latest hand-edited entry
   * (currently 0017_potassium_intake_type). The check only wakes once
   * wall-clock reaches it — by which point every committed entry is in the
   * past, so a freshly generated migration's real timestamp naturally exceeds
   * them all. From then on there is no reason to hand-edit, and any
   * future-dated `when` is a genuine regression this check will catch. If a
   * cutoff lower than the newest hand-edited entry is used, the check wakes
   * early and fails the build on that still-future entry.
   */
  const HANDWRITTEN_CUTOFF = 1780800000000; // 0017_potassium_intake_type — ≈ 2026-06-07

  it.skipIf(Date.now() < HANDWRITTEN_CUTOFF)(
    "no migration carries a future-dated (hand-written) `when`",
    () => {
      const now = Date.now();
      for (const entry of journal.entries) {
        expect(
          entry.when,
          `${entry.tag} (when=${entry.when}) is dated in the future. ` +
            `Do not hand-edit drizzle/meta/_journal.json — let ` +
            `drizzle-kit generate write a real timestamp.`,
        ).toBeLessThanOrEqual(now);
      }
    },
  );
});
