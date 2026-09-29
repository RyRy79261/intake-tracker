// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "@/hooks/use-live-query";

// LiquidsCard's preset tab gates AI features on useAuthGate; open it so the
// card renders fully in the test environment (the real app needs no mock).
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
  useAuth: () => ({ authenticated: false, user: null, ready: true }),
}));

import { ComponentPreview } from "@/components/help/component-preview";
import { getManualPreview } from "@/components/help/preview-registry";
import {
  createPreviewDatabase,
  isPreviewDatabaseActive,
  readRealDatabase,
  resetActiveDatabase,
  setActiveDatabase,
} from "@/lib/db";
/* eslint-disable-next-line no-restricted-imports -- stand-ins for background windows read `db` like services do */
import { db } from "@/lib/db";
import { makeQueryClient } from "@/lib/query-client";
import { seedLiquidsPreview } from "@/lib/help/preview-data";
import { useSettingsStore } from "@/stores/settings-store";
import { generateId, syncFields } from "@/lib/utils";

/**
 * Verifies the Phase 2 seam end to end: ComponentPreview creates an isolated
 * preview database, swaps it in via the `db` live binding, seeds it, and the
 * real app components — through their real hooks — read that seeded data.
 */
function renderPreview(slug: string) {
  const preview = getManualPreview(slug);
  if (!preview) throw new Error(`no preview registered for "${slug}"`);
  return render(
    <ComponentPreview seed={preview.seed}>
      {preview.render()}
    </ComponentPreview>,
  );
}

const demo = () => screen.getByTestId("manual-demo");

beforeEach(() => {
  useSettingsStore.setState({ wardShell: false });
});

describe("ComponentPreview", () => {
  it("renders a live component against a seeded, isolated preview database", async () => {
    renderPreview("blood-pressure");

    expect(screen.getByText(/live preview · sample data · not saved/i)).toBeInTheDocument();
    // The seeded most-recent reading is 118/76 — its appearance proves the
    // active-database swap took effect and the card read the preview database.
    expect(
      await screen.findAllByText(/118\/76/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });

  it("seeds intake records for the drinks preview", async () => {
    renderPreview("logging-drinks");

    expect(
      await screen.findAllByText(/250ml/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });

  it("seeds both cards for the bathroom preview", async () => {
    renderPreview("urination-and-bowel");

    expect(
      await screen.findByText("pale", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("normal", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("shows the Today gadget for how-it-works when the shell is on", async () => {
    useSettingsStore.setState({ wardShell: true });
    renderPreview("how-it-works");

    const water = await screen.findByTestId("today-row-water", undefined, { timeout: 5000 });
    // Today's seeded water (946 ml) proves the gadget read the sample week.
    await waitFor(() => expect(water).toHaveAccessibleName(/Water today 946/));
  });

  it("lists sample records on Metrics › Records for editing-entries", async () => {
    renderPreview("editing-entries");

    expect(
      await screen.findAllByText(/118\/76/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });

  it("shows the sample schedule and a + button for medication-schedule", async () => {
    renderPreview("medication-schedule");

    expect(
      await screen.findAllByText("Furosemide", undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
    expect(within(demo()).getByRole("button", { name: "Add medication" })).toBeInTheDocument();
  });

  it("opens the Add medication wizard from the + button for adding-medication", async () => {
    renderPreview("adding-medication");

    const add = await within(demo()).findByRole("button", { name: "Add medication" }, { timeout: 5000 });
    fireEvent.click(add);
    expect(await screen.findByText("Search Medicine", undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it("pauses and hands the real database back when a control outside is used", async () => {
    render(
      <>
        <button type="button">Outside</button>
        <ComponentPreview seed={seedLiquidsPreview}>
          <p>demo body</p>
        </ComponentPreview>
      </>,
    );
    await screen.findByText("demo body");
    expect(isPreviewDatabaseActive()).toBe(true);

    // Inside the preview: nothing changes.
    fireEvent.pointerDown(screen.getByText("demo body"));
    expect(isPreviewDatabaseActive()).toBe(true);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    // Synchronously, before the outside control's click handler runs.
    expect(isPreviewDatabaseActive()).toBe(false);
    await waitFor(() => expect(demo()).toHaveAttribute("data-status", "paused"));

    fireEvent.click(within(demo()).getByRole("button", { name: "Resume preview" }));
    await screen.findByText("demo body");
    expect(isPreviewDatabaseActive()).toBe(true);
  });
});

/** Stands in for a window behind the manual, on the app-wide query client. */
function Background() {
  const counted = useQuery({
    queryKey: ["bg-water-count"],
    queryFn: () => db.intakeRecords.count(),
  });
  return <p data-testid="bg-query">{counted.data ?? "…"}</p>;
}

/** A live query (the app's hook) that mounts while the preview is on screen. */
function LateBackground() {
  const n = useLiveQuery(() => db.intakeRecords.count());
  return <p data-testid="bg-live">{n ?? "…"}</p>;
}

describe("ComponentPreview isolation from background windows", () => {
  it("keeps the app-wide client and live queries off the sample data", async () => {
    // One real record; the preview seeds three.
    await db.intakeRecords.add({
      id: generateId(),
      type: "water",
      amount: 500,
      timestamp: Date.now(),
      source: "manual",
      ...syncFields(),
    });
    const client = makeQueryClient();

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Background />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("bg-query")).toHaveTextContent("1"));

    const withPreview = (late: boolean, preview: boolean) => (
      <QueryClientProvider client={client}>
        <Background />
        {late && <LateBackground />}
        {preview && (
          <ComponentPreview seed={seedLiquidsPreview}>
            <p>demo body</p>
          </ComponentPreview>
        )}
      </QueryClientProvider>
    );

    rerender(withPreview(false, true));
    await screen.findByText("demo body");
    expect(isPreviewDatabaseActive()).toBe(true);

    // A background refetch while the preview is up waits for the real
    // database instead of reading the three sample rows.
    let refetched = false;
    void client.invalidateQueries({ queryKey: ["bg-water-count"] }).then(() => {
      refetched = true;
    });
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(refetched).toBe(false);
    expect(screen.getByTestId("bg-query")).toHaveTextContent("1");

    // A live query mounting behind the manual waits instead of reading the
    // three sample rows...
    rerender(withPreview(true, true));
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(screen.getByTestId("bg-live")).toHaveTextContent("…");

    // ...and reads the real data once the preview is gone, while the held
    // refetch completes against the real database.
    rerender(withPreview(true, false));
    expect(isPreviewDatabaseActive()).toBe(false);
    await waitFor(() => expect(screen.getByTestId("bg-live")).toHaveTextContent("1"));
    await waitFor(() => expect(refetched).toBe(true));
    expect(screen.getByTestId("bg-query")).toHaveTextContent("1");
  });
});

describe("readRealDatabase", () => {
  it("runs a read again when a preview swaps in while it is in flight", async () => {
    let runs = 0;
    let resume: () => void = () => {};
    const result = readRealDatabase(async () => {
      runs += 1;
      if (runs === 1) {
        await new Promise<void>((r) => {
          resume = r;
        });
      }
      return runs;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);

    const preview = createPreviewDatabase();
    setActiveDatabase(preview);
    resume();
    await new Promise((r) => setTimeout(r, 20));
    // Caught mid-read: it waits for the real database instead of returning.
    expect(runs).toBe(1);

    resetActiveDatabase();
    await expect(result).resolves.toBe(2);
    await preview.delete();
  });
});
