import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/sync-engine", () => ({ schedulePush: vi.fn() }));

import {
  addJournalEntry,
  buildJournalEntry,
  deleteJournalEntry,
  getJournalEntries,
  getJournalEntriesBetween,
} from "@/lib/journal-service";
import { titleFromWords } from "@intake/core/journal";

const NOW = 1_800_000_000_000;

describe("buildJournalEntry", () => {
  it("keeps the words as written and fills the defaults", () => {
    const r = buildJournalEntry({ words: "  Today I woke up late.  ", kind: "event" }, NOW);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      words: "Today I woke up late.",
      finding: "Today I woke up late.",
      kind: "event",
      places: [],
      severity: null,
      timestamp: NOW,
      timePrecision: "exact",
      deletedAt: null,
    });
  });

  it.each([
    [{ words: "   ", kind: "symptom" as const }, /Write what you noticed/],
    [{ words: "a".repeat(501), kind: "symptom" as const }, /500/],
    [{ words: "knee", kind: "symptom" as const, places: ["knee"] }, /side/],
    [{ words: "knee", kind: "symptom" as const, severity: 11 }, /0 to 10/],
    [{ words: "knee", kind: "symptom" as const, severity: 2.5 }, /0 to 10/],
    [{ words: "knee", kind: "symptom" as const, timestamp: NOW + 3_600_000 }, /future/],
  ])("refuses %o", (input, message) => {
    const r = buildJournalEntry(input, NOW);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(message);
  });

  it("drops repeated places and cuts a long title", () => {
    const r = buildJournalEntry(
      { words: "x", finding: "t".repeat(80), kind: "symptom", places: ["eyes", "eyes"] },
      NOW,
    );
    expect(r.success && r.data.places).toEqual(["eyes"]);
    expect(r.success && r.data.finding).toHaveLength(60);
  });
});

describe("titleFromWords", () => {
  it("cuts a long sentence at a word", () => {
    expect(titleFromWords("Pain in my left knee, about a four, worse on the stairs going up")).toBe(
      "Pain in my left knee, about a four…",
    );
    expect(titleFromWords("Short one")).toBe("Short one");
  });
});

describe("journal entries in the database", () => {
  // Real time: an entry may not be in the future.
  const NOW = Date.now();
  it("adds, lists newest first and queues each entry for sync", async () => {
    await addJournalEntry({ words: "older", kind: "symptom", timestamp: NOW - 2000 });
    await addJournalEntry({ words: "newer", kind: "symptom", timestamp: NOW - 1000 });
    expect((await getJournalEntries()).map((e) => e.words)).toEqual(["newer", "older"]);
    expect((await getJournalEntriesBetween(NOW - 1500, NOW)).map((e) => e.words)).toEqual(["newer"]);
    expect(await db._syncQueue.where("tableName").equals("journalEntries").count()).toBe(2);
  });

  it("a delete wipes the content and hides the entry", async () => {
    const added = await addJournalEntry({
      words: "Bruise on my right shin",
      finding: "Bruise",
      kind: "sign",
      places: ["lowerleg-r"],
      severity: 2,
      timestamp: NOW - 1000,
    });
    expect(added.success).toBe(true);
    if (!added.success) return;
    expect((await deleteJournalEntry(added.data.id)).success).toBe(true);
    expect(await getJournalEntries()).toEqual([]);
    expect(await db.journalEntries.get(added.data.id)).toMatchObject({
      words: "",
      finding: "",
      places: [],
      severity: null,
    });
  });
});
