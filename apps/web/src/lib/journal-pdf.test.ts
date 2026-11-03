import { describe, it, expect } from "vitest";
import { buildJournalPDF, journalTableBody, journalTimeText } from "@/lib/journal-pdf";
import { makeJournalEntry } from "@/__tests__/fixtures/db-fixtures";

const at = (iso: string) => new Date(iso).getTime();

describe("journal printout", () => {
  it("writes the time by its precision", () => {
    const ts = at("2026-11-01T13:35:00");
    expect(journalTimeText({ timestamp: ts, timePrecision: "exact" })).toBe("13:35");
    expect(journalTimeText({ timestamp: ts, timePrecision: "approx" })).toBe("~13:35");
    expect(journalTimeText({ timestamp: ts, timePrecision: "day" })).toBe("-");
  });

  it("puts the date on the first row of each day, and the words beside the title", () => {
    const body = journalTableBody([
      makeJournalEntry({ timestamp: at("2026-11-01T08:00:00"), finding: "Woke up late", words: "Woke up late", places: [], severity: null }),
      makeJournalEntry({ timestamp: at("2026-11-01T13:30:00"), timePrecision: "approx", finding: "Nausea", words: "Felt nauseous after lunch", places: [], severity: 3 }),
      makeJournalEntry({ timestamp: at("2026-11-02T09:00:00") }),
    ]);
    expect(body[0]![0]).toBe("1 Nov 2026");
    expect(body[1]![0]).toBe("");
    expect(body[1]!.slice(1)).toEqual(["~13:30", 'Nausea\n"Felt nauseous after lunch"', "-", "3"]);
    expect(body[2]![0]).toBe("2 Nov 2026");
    expect(body[2]![3]).toBe("Knee, left");
  });

  it("puts the entries into the PDF", () => {
    const doc = buildJournalPDF({
      rows: [makeJournalEntry({ timestamp: at("2026-11-01T13:30:00"), finding: "Nausea", words: "Felt nauseous after lunch" })],
      fromMs: at("2026-10-20T00:00:00"),
      toMs: at("2026-11-02T12:00:00"),
      timeZone: "Europe/Berlin",
      printedAt: at("2026-11-02T12:00:00"),
    });
    const text = doc.output();
    expect(text).toContain("Nausea");
    expect(text).toContain("Felt nauseous after lunch");
    expect(text).toContain("Knee, left");
  });

  it("builds a PDF, also for an empty period", () => {
    const doc = buildJournalPDF({
      rows: [],
      fromMs: at("2026-10-20T00:00:00"),
      toMs: at("2026-11-02T12:00:00"),
      name: "Test Patient",
      timeZone: "Europe/Berlin",
      printedAt: at("2026-11-02T12:00:00"),
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
