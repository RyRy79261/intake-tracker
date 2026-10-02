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
import { screen, waitFor, within } from "@testing-library/react";
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
/** Extra response fields (dropped / overCap / transcriptTruncated). */
let parseExtras: Record<string, unknown> = {};

const transcribeBody = { text: "dictated transcript" };

const server = setupServer(
  http.post("*/api/ai/voice-transcribe", () => HttpResponse.json(transcribeBody)),
  http.post("*/api/ai/voice-parse", () =>
    HttpResponse.json({ items: parsedItems, ...parseExtras }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  parsedItems = [];
  parseExtras = {};
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

/**
 * Record → review → approve all → save, returning once the commit has finished.
 *
 * The completion signal is the review list unmounting: `commit` calls `reset()`
 * only when every item saved, so this waits for a condition the commit actually
 * establishes. (The "Saved N of M" toast would be the obvious choice, but no
 * Toaster is mounted in the test wrapper, so it never reaches the DOM.)
 */
async function dictateAndSave(items: VoiceParsedItem[]) {
  parsedItems = items;
  const user = userEvent.setup();
  await renderWithFixtures(<VoicePanel />);

  await user.click(screen.getByRole("button", { name: "mock-record" }));
  await screen.findByText(/Items \(/);
  await user.click(screen.getByRole("button", { name: /Approve all/i }));
  await user.click(screen.getByRole("button", { name: /^Save/ }));
  await waitFor(() => {
    expect(screen.queryByText(/Items \(/)).not.toBeInTheDocument();
  });
  return user;
}

describe("VoicePanel commit — one drink, one fluid amount", () => {
  it("logs a 500 ml beer as one water row, not two", async () => {
    // The repro from issue #322. The water row is the non-alcohol share of
    // the drink (100 − 5% ABV = 95% → 475 ml), never 1000.
    await dictateAndSave([
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await totalWaterMl()).toBe(475);

    const alcohol = await db.substanceRecords.toArray();
    expect(alcohol).toHaveLength(1);
    expect(alcohol[0]!.abvPercent).toBe(5);
  });

  it("flags a same-volume water item for review rather than dropping it", async () => {
    // Both rows reach the review list — a 500 ml beer alongside 500 ml of water
    // is an ordinary thing to dictate, so the user decides. "Approve all"
    // leaves the flagged pair pending; approving both one by one is taken at
    // face value.
    parsedItems = [
      { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 },
      { kind: "water", ml: 500 },
    ];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);

    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);
    // The warning is shown on both rows it concerns.
    expect(screen.getAllByText(/reject one of the two/i)).toHaveLength(2);
    expect(screen.getByText(/Items \(0 approved · 2 pending\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Approve all/i }));
    expect(screen.getByText(/Items \(0 approved · 2 pending\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve Alcohol" }));
    await user.click(screen.getByRole("button", { name: "Approve Water" }));
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(2);
    });
    // 475 ml from the beer (95% water) + the 500 ml glass.
    expect(await totalWaterMl()).toBe(975);
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
    expect(await totalWaterMl()).toBe(475);
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
    expect(await totalWaterMl()).toBe(725);
  });

  // ai-routes-models#9: a spirit is not all water. Voice has no preset water
  // content, so it books the non-alcohol share; the alcohol dose still comes
  // from the full measure.
  it("books a spirit's non-alcohol share as water and keeps the full volume on the alcohol", async () => {
    await dictateAndSave([
      { kind: "alcohol", description: "vodka", abvPercent: 40, volumeMl: 50 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await totalWaterMl()).toBe(30);
    const [alcohol] = await db.substanceRecords.toArray();
    expect(alcohol!.volumeMl).toBe(50);
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

    // Provenance is the record's `source`; the note is left for a real note.
    const health = [
      ...(await db.bloodPressureRecords.toArray()),
      ...(await db.weightRecords.toArray()),
      ...(await db.urinationRecords.toArray()),
      ...(await db.defecationRecords.toArray()),
    ];
    for (const record of health) {
      expect(record.source).toBe("voice");
      expect(record.note).toBeUndefined();
    }
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

describe("VoicePanel review — telling the user what was left out", () => {
  async function recordOnce() {
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);
    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);
    return user;
  }

  it("warns when the parser dropped malformed items", async () => {
    parsedItems = [{ kind: "water", ml: 250 }];
    parseExtras = { dropped: 2 };
    await recordOnce();
    expect(screen.getByText(/2 items? .*left out/i)).toBeInTheDocument();
  });

  it("warns when only part of a long transcript was parsed", async () => {
    parsedItems = [{ kind: "water", ml: 250 }];
    parseExtras = { transcriptTruncated: true };
    await recordOnce();
    expect(screen.getByText(/not parsed/i)).toBeInTheDocument();
  });

  it("shows the sugar merged onto a drink row", async () => {
    parsedItems = [
      { kind: "caffeine", description: "latte", caffeineMg: 80, volumeMl: 250 },
      { kind: "food", description: "latte", waterMl: 250, sugarG: 12 },
    ];
    await recordOnce();
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    expect(screen.getByText(/Merged the separate "latte"/)).toBeInTheDocument();
  });
});

describe("VoicePanel review — validation", () => {
  it("does not approve an invalid row with Approve all", async () => {
    // A urination row with no amount can't be approved until one is picked;
    // the rest of the batch still saves.
    parsedItems = [{ kind: "urination" }, { kind: "water", ml: 250 }];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);
    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);

    await user.click(screen.getByRole("button", { name: /Approve all/i }));
    expect(screen.getByText(/Items \(1 approved · 1 pending\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await db.urinationRecords.count()).toBe(0);
  });
});

describe("VoicePanel commit — timing", () => {
  it("saves an item at the time the user said", async () => {
    // Dictated "BP at 8 this morning": it must not land at save time.
    const before = Date.now();
    await dictateAndSave([
      { kind: "blood_pressure", systolic: 118, diastolic: 76, time: "08:00" },
    ]);
    await waitFor(async () => {
      expect(await db.bloodPressureRecords.count()).toBe(1);
    });
    const [bp] = await db.bloodPressureRecords.toArray();
    const when = new Date(bp!.timestamp);
    expect(when.getHours()).toBe(8);
    expect(when.getMinutes()).toBe(0);
    expect(bp!.timestamp).toBeLessThanOrEqual(before + 60_000);
  });

  it("gives every item of one save the same timestamp", async () => {
    await dictateAndSave([
      { kind: "weight", weightKg: 80 },
      { kind: "water", ml: 250 },
      { kind: "salt", sodiumMg: 400 },
    ]);
    await waitFor(async () => {
      expect(await db.intakeRecords.count()).toBe(2);
    });
    const [weight] = await db.weightRecords.toArray();
    const intakes = await db.intakeRecords.toArray();
    expect(new Set([weight!.timestamp, ...intakes.map((r) => r.timestamp)]).size).toBe(1);
  });
});

describe("VoicePanel — caffeine from presets", () => {
  it("books a moka from the Moka preset's concentration", async () => {
    // Default Moka preset: 130 mg per 100 ml, so 200 ml is 260 mg — not the
    // drip-coffee-anchored estimate.
    await dictateAndSave([
      { kind: "caffeine", description: "moka pot coffee", caffeineMg: 134, volumeMl: 200 },
    ]);
    await waitFor(async () => {
      expect(await db.substanceRecords.count()).toBe(1);
    });
    const [substance] = await db.substanceRecords.toArray();
    expect(substance!.amountMg).toBe(260);
  });
});

describe("VoicePanel — recording again", () => {
  it("keeps unsaved rows and appends the new recording's items", async () => {
    parsedItems = [{ kind: "weight", weightKg: 80 }];
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);
    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);
    await user.click(screen.getByRole("button", { name: "Approve Weight" }));

    parsedItems = [{ kind: "water", ml: 250 }];
    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByRole("button", { name: "Approve Water" });

    // The approved weight row survived the second recording.
    expect(screen.getByText(/Items \(1 approved · 1 pending\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve all/i }));
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(async () => {
      expect(await db.weightRecords.count()).toBe(1);
    });
    expect(await waterRows()).toHaveLength(1);
  });
});

describe("VoicePanel row refresh", () => {
  it("re-looks-up only the edited row and keeps its time", async () => {
    parsedItems = [
      { kind: "caffeine", description: "lot", caffeineMg: 5, volumeMl: 350, time: "08:30" },
      { kind: "water", ml: 250 },
    ];
    let refreshBody: unknown;
    const user = userEvent.setup();
    await renderWithFixtures(<VoicePanel />);
    await user.click(screen.getByRole("button", { name: "mock-record" }));
    await screen.findByText(/Items \(/);

    server.use(
      http.post("*/api/ai/voice-parse", async ({ request }) => {
        refreshBody = await request.json();
        return HttpResponse.json({
          items: [{ kind: "caffeine", description: "latte", caffeineMg: 130, volumeMl: 350 }],
        });
      }),
    );

    const row = screen.getByTestId("voice-item-0");
    const description = within(row).getByDisplayValue("lot");
    await user.clear(description);
    await user.type(description, "latte");
    await user.click(within(row).getByRole("button", { name: "Refresh Caffeine with AI" }));

    await waitFor(() => {
      expect(within(row).getByDisplayValue("130")).toBeInTheDocument();
    });
    expect(refreshBody).toEqual({ transcript: "latte (350 ml)", kind: "caffeine" });
    expect(within(row).getByDisplayValue("08:30")).toBeInTheDocument();
    // The other row is untouched.
    expect(within(screen.getByTestId("voice-item-1")).getByDisplayValue("250")).toBeInTheDocument();
  });
});
