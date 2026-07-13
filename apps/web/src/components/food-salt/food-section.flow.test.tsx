// @vitest-environment jsdom
/**
 * Integration flow test: AI parse → form populate → submit → Dexie write.
 *
 * This is the "missing middle" layer from docs/TESTING_STRATEGY.md §2.1:
 * a single test that exercises the network seam (mocked via MSW), the
 * component state machine, React Query, the real settings store, real
 * Dexie (via fake-indexeddb), and the dexie-react-hooks live query —
 * end to end. A regression in any of those layers fails this one test,
 * which is the property unit tests of each layer can't give us.
 *
 * Paradigm: replace ~5 shallow unit tests that each mock the adjacent
 * layer with one test that mocks only the HTTP boundary. The test reads
 * like a user story: "type a description, hit enter, see the fields
 * populate, submit, see it in the recent list."
 *
 * MSW handler pattern follows the official Vitest integration guide:
 * https://mswjs.io/docs/integrations/node
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dateTimeLocalToTimestamp } from "@/lib/date-utils";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
// Test-only direct DB access: needed to assert the integration write
// reached IndexedDB. The lint rule targets production components, not
// their co-located tests.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";

// Radix Select needs these jsdom polyfills to open inside a test.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// Open the auth gate so FoodSection renders its AI helper UI (the input
// labelled "Describe food for AI nutritional parsing").
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { FoodSection } from "@/components/food-salt/food-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";

// MSW server — intercepts the parseIntakeWithAI → apiFetch → fetch chain.
// Handler URL must match what fetch resolves to in jsdom (origin =
// http://localhost:3000 by default), so we register both the relative
// and absolute forms to be defensive.
const server = setupServer(
  http.post("http://localhost:3000/api/ai/parse", async () =>
    HttpResponse.json({
      water: 200,
      salt: 450,
      measurement_type: "sodium",
      sugar: 12,
      reasoning: "Bowl of chicken soup: ~200 ml water, ~450 mg sodium, ~12 g sugar.",
    }),
  ),
  http.post("/api/ai/parse", async () =>
    HttpResponse.json({
      water: 200,
      salt: 450,
      measurement_type: "sodium",
      sugar: 12,
      reasoning: "Bowl of chicken soup: ~200 ml water, ~450 mg sodium, ~12 g sugar.",
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("FoodSection — AI parse → submit → Dexie write (MSW integration)", () => {
  beforeEach(async () => {
    // Belt-and-braces: setup.ts already clears every test, but this test
    // depends on a known empty starting state for the bulkAdd assertion.
    await db.eatingRecords.clear();
    await db.intakeRecords.clear();
  });

  it("AI-populates the form and writes the resulting records to IndexedDB on submit", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const aiInput = await screen.findByLabelText(
      /Describe food for AI nutritional parsing/i,
    );
    await user.type(aiInput, "bowl of chicken soup");
    await user.keyboard("{Enter}");

    // The MSW response populates sodium (450), water (200), sugar (12).
    // The component renders these into labelled inputs; waitFor on the
    // sodium field ensures the parse handler has completed.
    await waitFor(() => {
      expect(screen.getByLabelText(/Sodium/i)).toHaveValue(450);
    });
    expect(screen.getByLabelText(/Sugar/i)).toHaveValue(12);
    expect(screen.getByLabelText(/Water content \(ml\)/i)).toHaveValue(200);

    // Submit the populated entry.
    await user.click(
      screen.getByRole("button", { name: "Record with details" }),
    );

    // The component writes a composable eatingRecord plus one intakeRecord
    // per substance (salt, sugar, water from food). We assert on the
    // intakeRecords because that's where AI-populated values land.
    await waitFor(async () => {
      const intakes = await db.intakeRecords.toArray();
      // At least one salt record matching the AI value should exist.
      const saltRow = intakes.find((r) => r.type === "salt" && r.amount === 450);
      expect(saltRow, `expected a salt=450 intake record, got: ${JSON.stringify(intakes)}`).toBeDefined();
    });

    // And a recent-list UI signal that the write reached the live query.
    expect(await screen.findByText("bowl of chicken soup")).toBeInTheDocument();
  });

  it("backdates the entry to a custom event time when the time input is used", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    // Enter a sodium amount so the entry can be recorded (submit is enabled).
    await user.type(await screen.findByLabelText(/Sodium/i), "300");

    // Open the collapsible time control (toggle button) and set a past time.
    await user.click(
      screen.getByRole("button", { name: /set different time/i }),
    );
    const timeInput = screen.getByLabelText(
      /when did you have this/i,
    ) as HTMLInputElement;
    // datetime-local typing is unreliable in jsdom; set the value directly.
    fireEvent.change(timeInput, { target: { value: "2026-07-10T09:00" } });

    await user.click(
      screen.getByRole("button", { name: "Record with details" }),
    );

    const expectedTs = dateTimeLocalToTimestamp("2026-07-10T09:00");
    await waitFor(async () => {
      const salt = (await db.intakeRecords.toArray()).find(
        (r) => r.type === "salt" && r.amount === 300,
      );
      expect(salt, "expected a salt=300 intake record").toBeDefined();
      expect(salt?.timestamp).toBe(expectedTs);
    });
  });

  it("falls back gracefully when the AI endpoint returns 502", async () => {
    server.use(
      http.post("http://localhost:3000/api/ai/parse", () =>
        HttpResponse.json({ error: "Failed to process request" }, { status: 502 }),
      ),
      http.post("/api/ai/parse", () =>
        HttpResponse.json({ error: "Failed to process request" }, { status: 502 }),
      ),
    );

    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const aiInput = await screen.findByLabelText(
      /Describe food for AI nutritional parsing/i,
    );
    await user.type(aiInput, "mystery substance");
    await user.keyboard("{Enter}");

    // After a 502, the component should NOT auto-populate (and the user
    // is free to type their own values). The sodium field stays empty.
    await waitFor(() => {
      // Give the parse handler time to fail; sodium should remain unset.
      expect((screen.getByLabelText(/Sodium/i) as HTMLInputElement).value).toBe("");
    });

    // And we wrote nothing to the database — empty start, empty end.
    expect(await db.intakeRecords.count()).toBe(0);
  });
});
