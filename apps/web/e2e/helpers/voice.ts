import { expect, type Page } from "@playwright/test";

/**
 * Helpers for specs that drive the voice logger and the Food card's AI parse.
 *
 * Both are shown only to a signed-in user. These specs run offline, so the
 * client's session check is answered here. Every AI call is mocked too, so
 * no server route that needs a real session is reached.
 *
 * A spec that records must launch Chromium with a fake microphone; see
 * {@link FAKE_MIC}.
 */

/** `test.use(FAKE_MIC)`: a fake microphone the recorder can open. */
export const FAKE_MIC = {
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
};

/** Answer the client's session check as signed in. */
export async function mockSignedIn(page: Page): Promise<void> {
  const now = new Date().toISOString();
  const user = {
    id: "e2e-user",
    email: "e2e@example.com",
    name: "E2E",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  const session = {
    id: "e2e-session",
    userId: user.id,
    token: "e2e",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  };
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({ json: { session, user } }),
  );
}

/** Mock the transcribe and parse routes: the parse returns `items`. */
export async function mockVoiceParse(page: Page, items: unknown[]): Promise<void> {
  await page.route("**/api/ai/voice-transcribe", (route) =>
    route.fulfill({ json: { text: "dictated in an e2e test" } }),
  );
  await page.route("**/api/ai/voice-parse", (route) =>
    route.fulfill({ json: { items, reasoning: "mocked" } }),
  );
}

/**
 * Hold the bottom bar's "Hold to talk" button (from the keyboard) for over a
 * second, let go, and wait for the review list.
 */
export async function holdToTalk(page: Page): Promise<void> {
  const mic = page.getByRole("button", { name: "Hold to talk to the AI logger" });
  await expect(mic).toBeVisible();
  await mic.focus();
  await page.keyboard.down("Space");
  const listening = page.getByTestId("hold-to-talk-listening");
  await expect(listening.getByText("Say what you ate or drank")).toBeVisible();
  // The hold must outlast the tap threshold; the timer shows it has.
  await expect(page.getByTestId("hold-to-talk-timer")).toHaveText("0:01", { timeout: 5_000 });
  await page.keyboard.up("Space");
  await expect(page.getByText(/Items \(/)).toBeVisible();
}

/** A review row by its position in the list. */
export function voiceRow(page: Page, index: number) {
  return page.getByTestId(`voice-item-${index}`);
}

type Row = Record<string, unknown>;

/** Every row of one IndexedDB table, read straight from the store. */
export async function readTable(page: Page, table: string): Promise<Row[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("IntakeTrackerDB");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, table);
}
