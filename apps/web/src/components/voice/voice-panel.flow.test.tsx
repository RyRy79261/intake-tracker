// @vitest-environment jsdom
/**
 * Integration flow test for the voice commit path — the origin of issue #322.
 *
 * `voice-panel.tsx` had no test of any kind, which is why a path that could
 * write two water records for one dictated drink shipped. This mocks only the
 * HTTP boundary (transcribe + parse) and asserts what reached Dexie, counting
 * water rows *unscoped by source* — the property a source-scoped assertion
 * cannot see.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import type { VoiceParsedItem } from "@/lib/voice-types";

// The real recorder needs MediaRecorder + getUserMedia. Replace it with a
// button that hands the panel a blob directly, so the test drives the same
// `onRecorded` entry point the microphone would.
vi.mock("@/components/voice/voice-recorder", () => ({
  VoiceRecorder: ({
    onRecorded,
  }: {
    onRecorded: (blob: Blob, mimeType: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onRecorded(new Blob(["audio"]), "audio/webm")}
    >
      mock-record
    </button>
  ),
}));

import { VoicePanel } from "@/components/voice/voice-panel";
import { renderWithFixtures } from "@/__tests__/react-test-utils";

/** Items the mocked parse route returns for the next request. */
let parsedItems: VoiceParsedItem[] = [];

const transcribeBody = { text: "dictated transcript" };

const server = setupServer(
  http.post("*/api/ai/voice-transcribe", () => HttpResponse.json(transcribeBody)),
  http.post("*/api/ai/voice-parse", () =>
    HttpResponse.json({ items: parsedItems }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  parsedItems = [];
});
afterAll(() => server.close());

/** Every live water row, regardless of which caller wrote it. */
async function waterRows() {
  return (
    await db.intakeRecords.where("type").equals("water").toArray()
  ).filter((r) => r.deletedAt === null);
}

async function totalWaterMl(): Promise<number> {
  return (await waterRows()).reduce((sum, r) => sum + r.amount, 0);
}

/** Record → review → approve all → save. */
async function dictateAndSave(items: VoiceParsedItem[]) {
  parsedItems = items;
  const user = userEvent.setup();
  await renderWithFixtures(<VoicePanel />);

  await user.click(screen.getByRole("button", { name: "mock-record" }));
  await screen.findByText(/Items \(/);
  await user.click(screen.getByRole("button", { name: /Approve all/i }));
  await user.click(screen.getByRole("button", { name: /^Save/ }));
  await waitFor(async () => {
    expect(await db.substanceRecords.count()).toBeGreaterThanOrEqual(0);
  });
  return user;
}

describe("VoicePanel commit — one drink, one fluid amount", () => {
  it("logs a 500 ml beer as 500 ml of water, not 1000", async () => {
    // The repro from issue #322.
    await dictateAndSave([
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await totalWaterMl()).toBe(500);

    const alcohol = await db.substanceRecords.toArray();
    expect(alcohol).toHaveLength(1);
    expect(alcohol[0]!.abvPercent).toBe(5);
  });

  it("flags a same-volume water item for review rather than dropping it", async () => {
    // Both rows reach the review list — a 500 ml beer alongside 500 ml of water
    // is an ordinary thing to dictate, so the user decides. Approving both is
    // taken at face value.
    parsedItems = [
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
      { kind: "water", ml: 500 },
    ];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);

    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);
    expect(screen.getByText(/reject one of the two/i)).toBeInTheDocument();
    expect(screen.getByText(/Items \(0 approved · 2 pending\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Approve all/i }));
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(2);
    });
    expect(await totalWaterMl()).toBe(1000);
  });

  it("records only the beer when the user rejects the flagged water row", async () => {
    parsedItems = [
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
      { kind: "water", ml: 500 },
    ];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);

    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);

    // Approve the beer, reject the duplicate water row. Row controls are
    // labelled per item kind ("Approve Alcohol" / "Reject Water").
    await user.click(screen.getByRole("button", { name: "Approve Alcohol" }));
    await user.click(screen.getByRole("button", { name: "Reject Water" }));
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(async () => {
      expect(await db.substanceRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(1);
    expect(await totalWaterMl()).toBe(500);
  });

  it("collapses a latte emitted as caffeine + food (the likely #322 shape)", async () => {
    await dictateAndSave([
      { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
      { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await totalWaterMl()).toBe(250);

    // The food item's sugar survives the merge.
    const sugar = await db.intakeRecords.where("type").equals("sugar").toArray();
    expect(sugar).toHaveLength(1);
    expect(sugar[0]!.amount).toBe(12);

    // ...and no stray eating record is left behind for the same drink.
    expect(await db.eatingRecords.count()).toBe(0);
  });

  it("groups a drink's water and substance so they can be edited as one", async () => {
    await dictateAndSave([
      { kind: "caffeine", description: "flat white", caffeineMg: 80, volumeMl: 250 },
    ]);

    await waitFor(async () => {
      expect(await db.substanceRecords.count()).toBe(1);
    });
    const [water] = await waterRows();
    const [substance] = await db.substanceRecords.toArray();
    expect(water!.groupId).toBeTruthy();
    expect(substance!.groupId).toBe(water!.groupId);
  });

  it("keeps a genuinely separate glass of water", async () => {
    await dictateAndSave([
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
      { kind: "water", ml: 250 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(2);
    });
    expect(await totalWaterMl()).toBe(750);
  });

  it("records a caffeine item with no volume as a dose only, inventing no hydration", async () => {
    await dictateAndSave([
      { kind: "caffeine", description: "coffee", caffeineMg: 95 },
    ]);

    await waitFor(async () => {
      expect(await db.substanceRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(0);
  });

  it("keeps the solutes of a caffeine item that has no volume", async () => {
    // Routing the no-volume branch through a bare substance add silently
    // dropped the item's sugar/sodium/potassium.
    await dictateAndSave([
      {
        kind: "caffeine",
        description: "sweet espresso",
        caffeineMg: 63,
        sugarG: 8,
        sodiumMg: 12,
      },
    ]);

    await waitFor(async () => {
      expect(await db.substanceRecords.count()).toBe(1);
    });
    const sugar = await db.intakeRecords.where("type").equals("sugar").toArray();
    expect(sugar).toHaveLength(1);
    expect(sugar[0]!.amount).toBe(8);
    const salt = await db.intakeRecords.where("type").equals("salt").toArray();
    expect(salt).toHaveLength(1);
    expect(salt[0]!.amount).toBe(12);
    // Still no invented hydration.
    expect(await waterRows()).toHaveLength(0);
    // ...and the solutes share the substance's group.
    const [substance] = await db.substanceRecords.toArray();
    expect(substance!.groupId).toBeTruthy();
    expect(sugar[0]!.groupId).toBe(substance!.groupId);
  });

  it("logs a meal's water content once", async () => {
    await dictateAndSave([
      { kind: "food", description: "bowl of soup", waterMl: 300, sodiumMg: 900 },
    ]);

    await waitFor(async () => {
      expect(await db.eatingRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(1);
    expect(await totalWaterMl()).toBe(300);
  });

  it("maps each item kind to exactly one domain table", async () => {
    await dictateAndSave([
      { kind: "blood_pressure", systolic: 118, diastolic: 76, heartRate: 60 },
      { kind: "weight", weightKg: 80 },
      { kind: "water", ml: 250 },
      { kind: "salt", sodiumMg: 400 },
      { kind: "urination", amountEstimate: "medium" },
      { kind: "defecation", amountEstimate: "small" },
    ]);

    // The commit loop writes sequentially, so wait for the whole set.
    await waitFor(async () => {
      expect(await db.bloodPressureRecords.count()).toBe(1);
      expect(await db.weightRecords.count()).toBe(1);
      expect(await db.urinationRecords.count()).toBe(1);
      expect(await db.defecationRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(1);
    const salt = await db.intakeRecords.where("type").equals("salt").toArray();
    expect(salt).toHaveLength(1);
  });
});

describe("VoicePanel commit — retrying a partial save", () => {
  it("does not re-save rows that already succeeded", async () => {
    // A partial commit leaves the review list open so the user can retry. The
    // retry used to re-run every approved item, duplicating the ones that had
    // already been written.
    parsedItems = [
      { kind: "water", ml: 250 },
      { kind: "weight", weightKg: 80 },
    ];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);

    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);
    await user.click(screen.getByRole("button", { name: /Approve all/i }));

    // Fail the second item once, so the first is written and the panel stays open.
    const addWeight = vi
      .spyOn(db.weightRecords, "add")
      .mockRejectedValueOnce(new Error("quota exceeded"));

    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await db.weightRecords.count()).toBe(0);

    // Retry: the water row must not be written a second time.
    addWeight.mockRestore();
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(async () => {
      expect(await db.weightRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(1);
    expect(await totalWaterMl()).toBe(250);
  });
});
