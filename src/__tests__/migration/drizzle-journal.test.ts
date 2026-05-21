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
});
