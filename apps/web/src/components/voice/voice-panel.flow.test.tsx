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
  beforeEach,
} from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import type { VoiceParsedItem } from "@/lib/voice-types";
import { logicalDayKey } from "@intake/core/logical-day";

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
  http.post("*/api/ai/voice-parse", async ({ request }) => {
    lastParseRequest = await request.json();
    return HttpResponse.json({ items: parsedItems, ...parseExtras });
  }),
);

/** Body of the most recent parse request the panel sent. */
let lastParseRequest: unknown = null;

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
    // The repro from issue #322. The water row is the drink's full volume
    // (500 ml, ethanol included), never 1000.
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
    // 500 ml from the beer + the 500 ml glass.
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

  // A spirit counts as fluid at its full measure, as on a clinical
  // intake/output chart; the alcohol dose comes from the same measure.
  it("books a spirit's full measure as fluid and keeps it on the alcohol", async () => {
    await dictateAndSave([
      { kind: "alcohol", description: "vodka", abvPercent: 40, volumeMl: 50 },
    ]);

    await waitFor(async () => {
      expect(await waterRows()).toHaveLength(1);
    });
    expect(await totalWaterMl()).toBe(50);
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
  // "Now" is 2026-09-30 14:00 on the device's own wall clock, in whatever
  // zone the suite runs (CI: Europe/Berlin and Africa/Johannesburg). Only
  // Date is faked, so Dexie, msw and waitFor keep their real timers.
  const NOW = new Date(2026, 8, 30, 14, 0);
  const local = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).getTime();

  describe("with a fixed clock", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("saves each approved item at the time the user said", async () => {
      // "I had a beer yesterday evening at 8pm, a bagel right now and 100mls
      // of water an hour ago."
      parsedItems = [
        {
          kind: "alcohol",
          description: "beer",
          abvPercent: 5,
          volumeMl: 500,
          when: { kind: "absolute", localDateTime: "2026-09-29T20:00" },
        },
        { kind: "food", description: "bagel" },
        { kind: "water", ml: 100, when: { kind: "relative", minutesAgo: 60 } },
      ];
      const user = userEvent.setup();
      await renderWithFixtures(<VoicePanel />);
      await user.click(screen.getByRole("button", { name: "mock-record" }));
      await screen.findByText(/Items \(/);

      // The request carried the device's clock, and nothing else new.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      expect(lastParseRequest).toEqual({
        transcript: "dictated transcript",
        now: {
          localDateTime: "2026-09-30T14:00",
          timeZone: tz,
          utcOffsetMinutes: -NOW.getTimezoneOffset() + 0, // + 0 turns -0 into 0 (UTC)
        },
      });

      // Each row shows its parsed time before anything is saved.
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Yesterday 20:00");
      expect(screen.getByTestId("voice-item-1-when")).toHaveTextContent("now, when saved");
      expect(screen.getByTestId("voice-item-2-when")).toHaveTextContent("Today 13:00");

      await user.click(screen.getByRole("button", { name: /Approve all/i }));
      await user.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => {
        expect(screen.queryByText(/Items \(/)).not.toBeInTheDocument();
      });

      const [beer] = await db.substanceRecords.toArray();
      expect(beer!.timestamp).toBe(local(29, 20));
      const [bagel] = await db.eatingRecords.toArray();
      expect(bagel!.timestamp).toBe(NOW.getTime());
      const water = await waterRows();
      expect(water).toHaveLength(2);
      // The beer's fluid (its full 500 ml) is booked with the beer, yesterday.
      expect(water.find((r) => r.amount === 500)!.timestamp).toBe(local(29, 20));
      expect(water.find((r) => r.amount === 100)!.timestamp).toBe(local(30, 13));

      // Day buckets under the app's 2am day start: the beer is yesterday's.
      expect(logicalDayKey(beer!.timestamp, 2, tz)).toBe("2026-09-29");
      expect(logicalDayKey(bagel!.timestamp, 2, tz)).toBe("2026-09-30");
    });

    it("saves at the time the user corrected the row to", async () => {
      parsedItems = [
        {
          kind: "blood_pressure",
          systolic: 118,
          diastolic: 76,
          when: { kind: "absolute", localDateTime: "2026-09-30T08:00" },
        },
      ];
      const user = userEvent.setup();
      const { container } = await renderWithFixtures(<VoicePanel />);
      await user.click(screen.getByRole("button", { name: "mock-record" }));
      await screen.findByText(/Items \(/);

      const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
      expect(input.value).toBe("2026-09-30T08:00");
      fireEvent.change(input, { target: { value: "2026-09-30T07:30" } });
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Today 07:30");

      await user.click(screen.getByRole("button", { name: /Approve all/i }));
      await user.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => {
        expect(screen.queryByText(/Items \(/)).not.toBeInTheDocument();
      });
      const [bp] = await db.bloodPressureRecords.toArray();
      expect(bp!.timestamp).toBe(new Date(2026, 8, 30, 7, 30).getTime());
    });

    it("saves a time the parser put in the future as now", async () => {
      await dictateAndSave([
        { kind: "water", ml: 250, when: { kind: "absolute", localDateTime: "2026-09-30T21:00" } },
      ]);
      const [water] = await waterRows();
      expect(water!.timestamp).toBe(NOW.getTime());
    });

    it("leaves a row dated over a week back for the user to approve by hand", async () => {
      parsedItems = [
        { kind: "water", ml: 250, when: { kind: "absolute", localDateTime: "2026-09-10T09:00" } },
        { kind: "water", ml: 100 },
      ];
      const user = userEvent.setup();
      await renderWithFixtures(<VoicePanel />);
      await user.click(screen.getByRole("button", { name: "mock-record" }));
      await screen.findByText(/Items \(/);
      expect(screen.getByText(/More than 7 days ago/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Approve all/i }));
      expect(screen.getAllByText("approved")).toHaveLength(1);

      // The user can still approve it; it saves at the old date.
      await user.click(screen.getAllByRole("button", { name: /approve water/i })[0]!);
      await user.click(screen.getByRole("button", { name: /^Save/ }));
      await waitFor(() => {
        expect(screen.queryByText(/Items \(/)).not.toBeInTheDocument();
      });
      const rows = await waterRows();
      expect(rows.find((r) => r.amount === 250)!.timestamp).toBe(
        new Date(2026, 8, 10, 9, 0).getTime(),
      );
    });
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

describe("VoicePanel — clip recorded by the host (hold to talk)", () => {
  it("transcribes and parses an initial clip once, on mount", async () => {
    let transcribeCalls = 0;
    server.use(
      http.post("*/api/ai/voice-transcribe", () => {
        transcribeCalls += 1;
        return HttpResponse.json(transcribeBody);
      }),
    );
    parsedItems = [{ kind: "water", ml: 250 }];
    const clip = { blob: new Blob(["audio"]), mimeType: "audio/webm" };

    const { rerender } = await renderWithFixtures(<VoicePanel initialClip={clip} />);
    await screen.findByText(/Items \(/);
    // A re-render with the same clip must not send the audio again.
    rerender(<VoicePanel initialClip={clip} />);
    await screen.findByText(/Items \(/);
    expect(transcribeCalls).toBe(1);
    expect(screen.getByText(/dictated transcript/)).toBeInTheDocument();
  });
});
