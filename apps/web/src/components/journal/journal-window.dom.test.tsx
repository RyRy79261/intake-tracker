// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import type * as JournalPdf from "@/lib/journal-pdf";

vi.mock("@/lib/sync-engine", () => ({ schedulePush: vi.fn() }));
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({ ready: true, authenticated: true, user: { id: "u1", email: "p@example.test", name: "Test Patient" } }),
}));
const saveJournalPDF = vi.fn();
vi.mock("@/lib/journal-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof JournalPdf>()),
  saveJournalPDF: (...args: unknown[]) => saveJournalPDF(...args),
}));

import { JournalWindowBody } from "@/components/journal/journal-window";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeJournalEntry, makePrescription } from "@/__tests__/fixtures/db-fixtures";

const live = async () => (await db.journalEntries.toArray()).filter((e) => e.deletedAt === null);

describe("Journal window", () => {
  it("fills in the details from the words and saves the entry", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<JournalWindowBody />);
    await user.type(
      screen.getByLabelText("What did you notice?"),
      "Pain in my left knee, about a four, worse on the stairs",
    );
    // The collapsed details summarise what was understood.
    expect(screen.getByText(/Details · 4\/10 · Knee, left · Felt/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to journal" }));
    await waitFor(async () => expect(await live()).toHaveLength(1));
    expect((await live())[0]).toMatchObject({
      words: "Pain in my left knee, about a four, worse on the stairs",
      finding: "Knee pain",
      kind: "symptom",
      places: ["knee-l"],
      severity: 4,
      source: "manual",
    });
    expect(await screen.findByTestId("journal-entry")).toHaveTextContent("Knee pain");
    expect(screen.getByLabelText("What did you notice?")).toHaveValue("");
  });

  it("shows no intensity for an unrated entry, also one stored without the key", async () => {
    const entry = makeJournalEntry({
      words: "Just had whooping cough, flu shot and dual hepatitis vaccine",
      finding: "Vaccinations",
      kind: "symptom",
      places: [],
      severity: null,
      timestamp: Date.now() - 60_000,
    });
    const { severity: _unrated, ...withoutKey } = entry;
    await renderWithFixtures(<JournalWindowBody />, {
      seed: { journalEntries: [withoutKey as typeof entry] },
    });
    const row = await screen.findByTestId("journal-entry");
    expect(row).toHaveTextContent("Felt");
    expect(row).not.toHaveTextContent(/undefined|\/10|severe/);
  });

  it("never overwrites a detail the person set", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<JournalWindowBody />);
    const words = screen.getByLabelText("What did you notice?");
    await user.type(words, "Headache");
    await user.click(screen.getByRole("button", { name: /^Details/ }));
    await user.click(screen.getByRole("button", { name: /Happened/ }));
    fireEvent.change(screen.getByRole("slider", { name: /intensity/i }), { target: { value: "6" } });
    await user.type(words, ", about a two");
    expect(screen.getByRole("button", { name: /Happened/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: /intensity/i })).toHaveValue("6");
  });

  it("names blood thinners in the bruise notice only when one is on the list", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<JournalWindowBody />, {
      seed: { prescriptions: [makePrescription({ genericName: "Apixaban", isActive: true })] },
    });
    await user.type(screen.getByLabelText("What did you notice?"), "A bruise on my right shin");
    expect(await screen.findByTestId("journal-notices")).toHaveTextContent(/common on blood thinners/);
  });

  it("deletes an entry only after confirming, and keeps none of its words", async () => {
    const user = userEvent.setup();
    const entry = makeJournalEntry({ timestamp: Date.now() - 60_000 });
    await renderWithFixtures(<JournalWindowBody />, { seed: { journalEntries: [entry] } });
    await user.click(await screen.findByRole("button", { name: "Delete Knee pain" }));
    let dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await live()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete Knee pain" }));
    dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/no undo/);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await live()).toHaveLength(0));
    expect(await db.journalEntries.get(entry.id)).toMatchObject({ words: "", finding: "" });
  });

  it("prints the chosen period, oldest first, as a PDF", async () => {
    const user = userEvent.setup();
    const day = 86_400_000;
    await renderWithFixtures(<JournalWindowBody />, {
      seed: {
        journalEntries: [
          makeJournalEntry({ id: "new", finding: "Knee pain", timestamp: Date.now() - day }),
          makeJournalEntry({ id: "old", finding: "Nausea", words: "Felt sick", places: [], timestamp: Date.now() - 3 * day }),
          makeJournalEntry({ id: "gone", finding: "Rash", timestamp: Date.now() - 40 * day }),
        ],
      },
    });
    await user.click(screen.getByRole("tab", { name: "Printout" }));
    const preview = await screen.findByTestId("journal-printout");
    expect(within(preview).getAllByRole("row").slice(1).map((r) => r.textContent)).toEqual([
      expect.stringContaining("Nausea"),
      expect.stringContaining("Knee pain"),
    ]);
    expect(preview).toHaveTextContent("Test Patient");
    await user.click(screen.getByRole("button", { name: /Save as PDF · 2 entries/ }));
    expect(saveJournalPDF).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Patient", rows: [expect.objectContaining({ id: "old" }), expect.objectContaining({ id: "new" })] }),
    );
  });
});
