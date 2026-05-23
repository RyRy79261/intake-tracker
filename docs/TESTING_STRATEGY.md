# Testing & Coverage Strategy — Research & Proposal

> Status: **research + partial implementation** — authored on branch
> `claude/coverage-stress-testing-research-yJSUb`. The proposal in §1–§4 was
> drafted first as a discussion artifact; §5 ("Implementation status")
> tracks which paradigms have since been wired up on the branch and what
> was learned along the way. Nothing has been merged to `main`; this
> document and the new test files all live on the research branch.

## TL;DR

The codebase has **a lot of tests** (≈166 Vitest files, 6 Playwright specs, 1
integration suite, 3 integrity suites, 2 benches), but the **distribution is
wrong** for the things that actually break a single-user offline-first PWA.

The recent push to fill coverage (24 routes + 19 hooks + 27 components in
three commits) raised line coverage but mostly added **shallow happy-path
unit tests**. The metric moved; the bug-catching power probably didn't move
nearly as much. There is **no mutation testing**, **no fuzz / property
testing**, **no adversarial input testing on the AI endpoints**, **no
accessibility scanning**, **no visual regression**, **no load test**, and
the multi-client conflict story for the sync engine is only lightly
exercised.

The proposal below is organised as a sequence of **paradigm shifts** — not
"add more tests of the same kind we already have." Each paradigm comes with
a concrete tool, a sample of what the test would look like in this
codebase, and an honest assessment of cost.

---

## 1. The current testing landscape (honest take)

### What we have

| Layer | Count | Tool | Where |
|---|---|---|---|
| Unit / service | ~80 | Vitest (node) | `src/__tests__/*.test.ts`, co-located `*.test.ts` |
| Component DOM | ~11 | Vitest + RTL | `src/**/*.dom.test.tsx` |
| Hook | ~19 | Vitest + RTL | `src/hooks/use-*.test.tsx` |
| API route handler | ~12 | Vitest | `src/__tests__/*-route.test.ts` |
| Postgres integration | 1 | Vitest + testcontainers | `src/__tests__/integration/` |
| Data integrity | 3 | Vitest | `src/__tests__/integrity/` |
| E2E | 5 specs | Playwright (Chromium only) | `e2e/*.spec.ts` |
| Benchmark | 2 | Vitest bench | `src/__tests__/bench/` |
| **Visual / a11y / fuzz / mutation / load** | **0** | — | — |

Coverage thresholds: **lines 54%, statements 53%, functions 45%, branches
44%**. Ratchet-enforced.

### What that coverage actually tells us

**Not much.** Coverage measures *execution*, not *assertion*. A test that
calls `parseAmount("12.5")` and never asserts on the output still counts the
line. Mutation testing is the only way to know whether the tests would catch
a real change — and we don't run it. My rough estimate, eyeballing several
of the recently added route/hook tests: **mutation score probably sits in
the 40–55% range**, well below the 80% benchmark cited in the [Stryker
Mutator best-practices guide](https://stryker-mutator.io/blog/typescript-coverage-analysis-support/).

### What is over-tested (or low-leverage)

- **Schema parity & ratchet config**: `schema-parity.test.ts`,
  `benchmark-coverage-config.test.ts`, `ci-workflow-structure.test.ts`,
  `supply-chain-config.test.ts`, `bundle-security.test.ts`. These are tests
  *of the test infrastructure*. Useful as guardrails but they don't catch
  product bugs.
- **Auth middleware**: 5 files (`auth-guard`, `auth-middleware`,
  `auth-middleware-bearer`, `auth-page`, `neon-auth-handler`). Likely
  diminishing returns past file 3.
- **24 route handler unit tests**: Most route logic is "validate → call
  service → format response." A single MSW-based integration test per
  feature would catch more real bugs.

### What is under-tested (the real risk surface)

1. **Adversarial AI responses.** The Anthropic SDK is called from three
   endpoints (`/api/ai/parse`, `/api/ai/medicine-search`,
   `/api/ai/substance-lookup`). The E2E mocks return *well-formed* success
   payloads. Nothing tests truncated JSON, `null` fields, out-of-range
   numbers, prompt-injection echo, or rate-limit/timeout.
2. **Multi-client sync conflicts.** There are SYNC-0x ack/backoff tests but
   no harness that runs *two* sync clients against the same record and
   verifies which write survives under clock skew.
3. **Scale.** No tests exist with 5k–50k records. The history page mounts
   Recharts with whatever Dexie returns. We don't know where it falls over.
4. **iOS 7-day storage eviction.** Per the [PWA Mobile Testing Checklist
   2026](https://mobileviewer.github.io/pwa-mobile-testing-checklist-2026),
   iOS evicts service-worker caches *and IndexedDB* after ~7 days idle
   unless persistent storage is granted. We never simulate the cold-start-
   after-eviction recovery path.
5. **Negative paths in E2E.** Only `sync-engine.spec.ts` has anything close
   to a failure-mode test (offline reconnect, sparse fields). Dashboard,
   medications, history, and settings are all happy-path only.
6. **Accessibility.** Zero. The app uses Radix primitives, which *can* be
   accessible — but only if wired up correctly, and we never verify.
7. **Visual regression.** Zero. With Recharts + Radix + Tailwind, a layout
   regression can ship undetected.
8. **Property / fuzz tests.** Zero. Dexie migrations, backup round-trip,
   timezone-bucket math, and dose-calc are textbook candidates.
9. **Mutation score.** Unknown.

---

## 2. Paradigm shifts to propose

Each subsection is independent. Adopt one, several, or all.

### 2.1 Pyramid → Testing Trophy → "Pumpkin"

**Status quo:** classic pyramid (lots of unit, few E2E).

**Recommendation:** shift to Kent Dodds' [Testing Trophy](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)
— invest most heavily in **integration tests that render a whole route
component in jsdom, mock HTTP at the MSW layer, and exercise real Dexie via
`fake-indexeddb`**. This is the "middle layer" we don't have today.

For 2026, [Nucamp's full-stack testing survey](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)
and [BrowserStack's React Testing 2026 guide](https://www.browserstack.com/guide/top-react-testing-libraries)
both recommend a 70/20/10 unit/integration/E2E split with MSW handling the
network seam. We are roughly 92/0/8 today.

**What this looks like in code:**

```ts
// src/__tests__/integration/dashboard-flow.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import DashboardPage from "@/app/page";
import { Providers } from "@/app/providers";

const server = setupServer(
  http.post("/api/ai/parse", () =>
    HttpResponse.json({ water_ml: 250, salt_mg: 0 })
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("user logs water → record appears → history reflects it", async () => {
  render(<Providers><DashboardPage /></Providers>);
  await userEvent.type(screen.getByLabelText(/describe drink/i), "1 cup water");
  await userEvent.click(screen.getByRole("button", { name: /add/i }));
  await screen.findByText(/250 ml/i);
  // Real Dexie write happened via fake-indexeddb. Now verify it:
  const records = await (await import("@/lib/db")).db.intakeRecords.toArray();
  expect(records).toHaveLength(1);
  expect(records[0].water_ml).toBe(250);
});
```

This test exercises: provider stack, React Query cache, the parse endpoint
contract, Dexie write, query invalidation, re-render. **One test, ten
units.** That's the leverage that's missing today.

**Tooling cost:**
- Add `msw` (≈400 KB devDep) and `jsdom` testing env config.
- Migrate `vi.stubGlobal("fetch", ...)` call sites to MSW handlers
  incrementally. Don't bulk-rewrite; new tests use MSW, old tests stay.

### 2.2 Mutation testing as the truth metric

Line coverage is a **leading indicator at best**, often misleading. The
remediation is well-trodden: run [Stryker Mutator](https://stryker-mutator.io/)
with the Vitest runner, get a mutation score, and gate CI on it instead of
(or alongside) line coverage.

The benchmark cited across [2026 mutation-testing write-ups](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
is **≥80% mutation score** for critical code. Anything below 60% means the
tests are mostly executing code, not asserting on it.

**Concrete plan:**
1. Add `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` as devDeps.
2. Configure Stryker to mutate **only the high-leverage subset**:
   - `src/lib/sync/**` (sync engine — the place a regression hurts most)
   - `src/lib/intake-service.ts`, `medication-service.ts`, `health-service.ts`
   - `src/lib/db.ts` migration callbacks
   - `src/db/schema.ts` is generated — skip
3. Run it as a **weekly nightly CI job**, not on every PR (a Stryker pass
   on the sync engine alone is ~10 minutes).
4. Publish the score as a badge / PR comment. Treat dropping the score the
   same way we treat dropping line coverage today.

**Honest cost:** Stryker is slow. Expect ~10× the normal test runtime for
the modules it covers. That's why it's nightly, not per-PR.

### 2.3 Property-based tests for the pure stuff

Several modules in this codebase are screaming for property tests:

| Module | Property to assert |
|---|---|
| `src/lib/backup-service.ts` | `import(export(db)) === db` for any random db state |
| `src/lib/db.ts` migrations | Any record valid at schema vN is valid at vN+1 after migration |
| `src/lib/timezone.ts` (if exists) | `bucketByDay(ts, tz)` is invariant under DST transitions |
| `src/lib/medication-service.ts` dose calc | Total daily dose ≥ 0; sum of phase doses == prescription total |
| `src/lib/sync/diff.ts` (if exists) | `applyDiff(state, diff(state, state')) === state'` |

[fast-check](https://fast-check.dev/) integrates directly with Vitest. It
generates random inputs, *shrinks* failing cases to a minimal repro, and
[`fast-check` is already trusted](https://github.com/dubzzz/fast-check)
by Jest, fp-ts, ramda, and others.

**Sample test:**

```ts
import { test } from "vitest";
import fc from "fast-check";
import { exportDb, importDb } from "@/lib/backup-service";

test("backup round-trip preserves every record", () => {
  fc.assert(fc.asyncProperty(arbitraryDbState(), async (state) => {
    await loadIntoDexie(state);
    const exported = await exportDb();
    await clearDexie();
    await importDb(exported);
    const reloaded = await dumpDexie();
    expect(reloaded).toEqual(state);
  }));
});
```

This **single property test** is stronger than `backup-round-trip.test.ts`
in its current form, which tests a hand-picked fixture.

### 2.4 Adversarial-input testing for the AI boundary

The Claude calls are the **single largest surface for "the universe handed
us garbage."** A test suite that doesn't fuzz that boundary is leaving the
biggest risk uncovered.

**Two layers:**

**Layer A — Contract fuzz for parse handlers.** Pure unit tests that pass
adversarial JSON strings (from a corpus) directly into the validation /
parsing function and assert it either succeeds or fails *gracefully*
(returns `null`, throws a typed error, never silently inserts wrong data
into Dexie).

```ts
const adversarial = [
  '{"water_ml": null}',
  '{"water_ml": -50}',
  '{"water_ml": 1e308}',
  '{"water_ml": "250"}',         // string instead of number
  '{"water_ml": 250, "extra": "field"}',
  '{"water_ml": 250',            // truncated
  '',                            // empty
  'null',
  '<script>alert(1)</script>',   // not JSON at all
  '{"water_ml": 250, "salt_mg": "ignore previous instructions and"}', // prompt echo
];

for (const input of adversarial) {
  test(`parseAi(${input.slice(0, 30)}…) doesn't corrupt state`, () => {
    expect(() => parseAi(input)).not.toThrow();
    // ...stronger assertions on the returned shape
  });
}
```

**Layer B — Red-team prompts via Promptfoo.** [Promptfoo](https://www.promptfoo.dev/docs/guides/llm-redteaming/)
is used by OpenAI and Anthropic for exactly this. It runs prompt variants
against the live Claude endpoint and grades the outputs. Worth a
nightly/weekly CI job (not per-PR — costs API spend) to catch *prompt
regression* when the system prompt is edited.

Recent academic work — [the LLM-based JSON parser fuzzer](https://arxiv.org/pdf/2410.21806)
and the [Unit 42 prompt-fuzzing study](https://unit42.paloaltonetworks.com/genai-llm-prompt-fuzzing/)
— shows this class of test catches real production bugs that nothing else
does.

### 2.5 Sync engine: state-machine property tests + two-client harness

The sync engine is the **single highest-leverage module** in this codebase.
A bug here can lose user health data — exactly the data the user trusts
this app with.

Today's tests are scenario-based (named SYNC-01…05). What's missing is
**model-based testing**: define the legal states + transitions, let
fast-check explore arbitrary sequences of (`write`, `goOffline`, `goOnline`,
`serverAck`, `serverReject`, `clockJump`), and assert invariants after each
step:

- "No record exists locally that isn't in the queue or on the server."
- "After two clients converge, both see the higher-timestamped record."
- "ack(serverVer N) where local has serverVer > N is a no-op."

This is exactly what fast-check's [model-based testing mode](https://fast-check.dev/docs/advanced/model-based-testing/)
is for, and what the [offline-first sync guide](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/)
recommends as table stakes.

**Two-client harness sketch:**

```ts
// Two independent fake-indexeddb instances backed by separate Dexie names
const clientA = await makeClient("A");
const clientB = await makeClient("B");
const fakeServer = makeFakeNeon();

await clientA.write({ id: "r1", weight_kg: 80, updatedAt: 1000 });
await clientB.write({ id: "r1", weight_kg: 82, updatedAt: 1500 });

await clientA.push(fakeServer);
await clientB.push(fakeServer);
await clientA.pull(fakeServer);

expect(await clientA.read("r1")).toEqual({ weight_kg: 82, updatedAt: 1500 });
```

We have the integration infra (testcontainers + Postgres). Wiring two
Dexie instances + the existing push/pull route handlers behind in-memory
fetch is ~half a day of work and gives us a permanent regression net
against the entire class of "I lost a record" bugs.

### 2.6 Chaos-as-fixtures: network, quota, clock

Per the [2026 chaos engineering frontends survey](https://testomat.io/blog/discover-the-power-of-chaos-testing-techniques/)
and [LogRocket's offline-first 2025 review](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/),
the canonical failure modes for a PWA are:

1. **Network drops mid-request** (not just "offline at start of test").
2. **IndexedDB quota exceeded** (`QuotaExceededError`).
3. **Service worker update race** during foreground use.
4. **Clock jump backward** (e.g., NTP sync; sync engines that rely on
   client `updatedAt` are vulnerable).
5. **iOS 7-day eviction** (cold-start with empty Dexie but server has data).

These are each ~30-line Playwright fixtures. Example:

```ts
test("write during network drop is recovered after reconnect", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  // … type a weight entry …
  await page.click("text=Save");
  await expect(page.getByText(/82 kg/)).toBeVisible(); // optimistic
  await context.setOffline(false);
  // wait for sync; assert server received it
});

test("quota exceeded → user sees actionable error", async ({ page }) => {
  await page.addInitScript(() => {
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = origPut.apply(this, args);
      Promise.resolve().then(() => {
        req.dispatchEvent(new Event("error"));
        Object.defineProperty(req, "error", { value: new DOMException("Quota", "QuotaExceededError") });
      });
      return req;
    };
  });
  // … exercise the failure path …
});
```

The point of "chaos-as-fixture" is that these are **opt-in**, repeatable,
and don't require external chaos tooling like LitmusChaos or Gremlin
(overkill for this app).

### 2.7 Accessibility scanning in the existing Playwright suite

This is the highest-ROI single addition. Per [the
@axe-core/playwright integration docs](https://dev.to/vitalyskadorva/accessible-web-testing-with-playwright-and-axe-core-2kg1),
axe catches 30–50% of real a11y issues automatically.

```ts
import AxeBuilder from "@axe-core/playwright";

test("dashboard has no critical a11y violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter(v => v.impact === "critical");
  expect(critical).toEqual([]);
});
```

Add one of these per page (dashboard, history, medications, settings). ~30
lines. Catches missing labels, contrast failures, ARIA mis-wiring, focus
order.

### 2.8 Visual regression with built-in Playwright snapshots

No third-party service needed (Chromatic/Percy are great but overkill for
a single-user app). Playwright's built-in `toHaveScreenshot` matcher gives
us baseline + diff for free.

```ts
test("dashboard renders consistently", async ({ page }) => {
  await page.goto("/");
  await page.getByText(/today/i).waitFor(); // wait for hydration
  await expect(page).toHaveScreenshot("dashboard.png", { maxDiffPixels: 50 });
});
```

**Caveat:** these are notoriously flaky if the test data isn't stable. Use
seeded fake data + a frozen clock fixture. Otherwise you'll spend more
time updating baselines than catching bugs.

### 2.9 Storybook play-function tests replace shallow `.dom.test.tsx`

The 11 `*.dom.test.tsx` files exercise components in node + RTL, which is
slow to set up (DOM polyfills, ResizeObserver, scrollIntoView, etc.) and
runs in a fake DOM that diverges from real browser behaviour. Per the
[Storybook 8 interaction testing docs](https://storybook.js.org/docs/8/writing-tests/component-testing)
and the [Red Hat "Storybook as behavioral verification engine" piece](https://developers.redhat.com/articles/2026/04/29/how-we-turned-storybook-behavioral-verification-engine),
the modern equivalent is a Storybook story with a `play` function — runs
in a real browser, isolates the component, doubles as visual documentation.

```tsx
// FoodSaltCard.stories.tsx
export const UserAddsManualSalt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /add salt/i }));
    await userEvent.type(canvas.getByLabelText(/mg/i), "500");
    await userEvent.click(canvas.getByRole("button", { name: /save/i }));
    await expect(canvas.getByText(/500 mg/)).toBeInTheDocument();
  },
};
```

The `@storybook/test-runner` then runs every story as a Playwright test in
CI, with screenshot diffing and a11y checks both available.

**Cost:** non-trivial — adding Storybook to the project is meaningful
config + a meaningful amount of story-writing. **Recommendation:** only
adopt this if the team is also going to use Storybook for design / docs.
Otherwise the cost dominates the testing benefit.

### 2.10 Backend load testing with k6 (or Artillery + Playwright)

This is the one most relevant to "wide-scale stress tests" — but be honest
about whether it applies to a single-user PWA.

The app's server surface is small:
- `/api/sync/push`, `/api/sync/pull` (the heavy ones)
- `/api/ai/parse`, `/api/ai/medicine-search`, `/api/ai/substance-lookup`
  (bounded by Anthropic rate limit anyway)
- `/api/auth/*` (Neon Auth handles its own scale)

For sync, [k6](https://grafana.com/docs/k6/latest/) is the right tool. A
single-script stress profile (per [Grafana's k6 stress-testing guide](https://grafana.com/blog/stress-testing/)):
ramp 1→500 VUs over 5 min, hold 5 min, ramp down. Run it against a
preview deploy on Vercel, not production. Measures p95 latency under
realistic payload sizes.

For full-browser load (per the [Artillery + Playwright integration](https://www.artillery.io/docs/playwright)
and [Loadview's Playwright scaling guide](https://www.loadview-testing.com/blog/playwright-load-testing/)),
50–200 concurrent headless browsers running real user flows costs real
money and is **probably not justified for a single-user app**. Skip
unless we ever multi-tenant this.

**Recommendation:** add k6 on the sync routes only. Keep it as a manually
triggered workflow, not per-PR.

### 2.11 Scale tests using `fake-indexeddb` (cheap, high signal)

Independent of load testing the *server*, we can load-test the *client*
cheaply:

```ts
test("history page renders with 10k weight records", async () => {
  await db.weightRecords.bulkAdd(makeFakeRecords(10_000));
  const start = performance.now();
  render(<Providers><HistoryPage /></Providers>);
  await screen.findByText(/weight/i);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(2_000); // budget
});
```

This catches the moment when Recharts mounts with too much data, or a
`useEffect` chain becomes accidentally O(n²) over the history list, long
before a real user hits it.

---

## 3. Suggested adoption sequence

Roughly ordered by **(value to a single-user PWA) ÷ (implementation cost)**:

### Phase A — quick wins (~1 day total)

1. Add `@axe-core/playwright`, drop one a11y assertion into each E2E spec
   (§2.7).
2. Add `msw` and write **one** integration test per route (`/`,
   `/medications`, `/history`, `/settings`) that mounts the page tree in
   jsdom and exercises a real user flow against MSW handlers (§2.1).
3. Write an adversarial-input table test for the AI parse handler (§2.4
   Layer A only — no Promptfoo yet).
4. Add `fast-check` and convert `backup-round-trip.test.ts` into a property
   test (§2.3).

### Phase B — depth (~2-3 days)

5. Wire up the two-client sync conflict harness (§2.5). This is the single
   most important addition for data integrity.
6. Add the scale test for the history page using fake-indexeddb (§2.11).
7. Add the chaos-as-fixture suite: network drop mid-request, quota
   exceeded, clock jump (§2.6).
8. Add Stryker mutation testing for `src/lib/sync/**` only, nightly CI
   (§2.2). Publish a baseline mutation score and commit not to let it
   regress.

### Phase C — strategic (~1 week)

9. Migrate the most-used `.dom.test.tsx` files to Storybook play-function
   tests **if** the team adopts Storybook for design too (§2.9). Skip
   otherwise.
10. Add a k6 sync-route stress profile + a weekly CI run against a
    preview deploy (§2.10).
11. Promptfoo red-team config for the AI endpoints, weekly nightly run
    (§2.4 Layer B).
12. Visual regression via Playwright's built-in `toHaveScreenshot`, with
    seeded fixtures + frozen clock (§2.8). Only if the layout is stable
    enough that the maintenance won't dominate.

### What I'd consciously *not* do

- **Don't keep adding shallow unit tests** to chase line coverage. The
  ratchet is fine as a guardrail; raising it past ~70% will start to
  reward bad tests.
- **Don't add Cypress or another E2E framework.** Playwright covers what
  Cypress does and more, per the [2026 Playwright/Cypress/Selenium
  benchmarks](https://testdino.com/blog/performance-benchmarks/).
- **Don't add Percy/Chromatic** unless the visual regression baseline
  proves valuable with the free Playwright `toHaveScreenshot` first. Costs
  add up fast on screenshot-quota plans.
- **Don't run heavy load tests against production.** Sync routes are
  shared with the real user's data. Always use a preview deploy with an
  ephemeral Neon branch (the infra is already there — `e2e` workflow does
  this).

---

## 4. The honest meta-point

A coverage number is a **proxy for confidence**, not the thing itself.
What actually moves confidence:

- **Mutation score** (knows the tests assert, not just execute).
- **User-flow integration tests** (catches bugs at the layer users care
  about).
- **Adversarial input on every external boundary** (Claude, the network,
  the clock, the disk quota).
- **One specific scenario test per known failure mode** (offline + reconnect,
  two clients writing the same record, IDB quota, iOS eviction recovery).

The current suite is strong on internal logic correctness (good!) and weak
on the boundaries where reality hits the code (bad). The proposals above
are deliberately weighted toward those boundaries.

---

## 5. Implementation status

The proposal in §1–§4 was drafted as a research artifact. After the
brief was accepted ("that sounds incredible, go for it"), the items
below were actually built on this branch. Test counts: **1625 unit
tests passing**, up from the 1594-test baseline (+31 net). Two more
Playwright specs added (`a11y.spec.ts`, `chaos.spec.ts`) and a
mutation-testing config.

### Built

| Paradigm | Status | File(s) | Notes |
|---|---|---|---|
| **§2.1** MSW integration "missing middle" | ✅ Built | `src/components/food-salt/food-section.flow.test.tsx` | Demonstrates pattern: type → MSW → Dexie → live-query rerender. Replaces ~5 shallow unit tests with one. |
| **§2.1** Day-in-the-life multi-card simulation | ✅ Built (extension) | `src/__tests__/day-in-the-life.flow.test.tsx` | 8 sequential user actions across 6 cards, runtime ~850 ms. Catches cross-card state corruption that single-action tests miss. |
| **§2.2** Mutation testing | ✅ Wired | `stryker.conf.json`, `pnpm test:mutation` | Scoped to `src/lib/sync-engine.ts` + `sync-queue.ts` + `sync-topology.ts` + `sync-payload.ts`. Stryker validates config; instruments 473 mutants. Baseline score not yet published — run `pnpm test:mutation` to generate. |
| **§2.3** Property testing — backup round-trip | ✅ Built | `src/__tests__/integrity/backup-round-trip.property.test.ts` | `forall db_state. reload(export(s)) ≡ s` over 22 generated states. |
| **§2.3** Property testing — timezone | ✅ Built | `src/lib/timezone.property.test.ts` | 8 properties, round-trip identity across 8 IANA zones including half-hour (Kolkata) and quarter-hour (Kathmandu) offsets. |
| **§2.3** Property testing — computeProgress | ✅ Built | `src/lib/medication-ui-utils.property.test.ts` | 7 properties on dose-progress aggregation, including idempotence-under-permutation. |
| **§2.4 Layer A** Adversarial AI fuzz | ✅ Built | `src/app/api/ai/parse/route.fuzz.test.ts` | 3 properties, 110+ random Claude shapes. Asserts the route always returns one of `{200, 400, 422, 429, 502}` with a valid body. |
| **§2.5** Two-client sync conflict | ✅ Built | `src/__tests__/sync-conflict.property.test.ts` | Property-based against the push route. 5 invariants (resurrection guard, LWW, clock-skew clamp, order-independence). **Real finding — see below.** |
| **§2.6** Chaos-as-fixtures | ✅ Built | `e2e/chaos.spec.ts` | 4 PWA failure modes: network drop mid-request, flaky API retry, IDB quota exceeded, clock jump backward. |
| **§2.7** axe-core a11y scanning | ✅ Built | `e2e/a11y.spec.ts` | Scans `/`, `/history`, `/medications`, `/settings`. Fails only on critical violations; logs serious for triage. |
| **§2.11** Client-side scale stress | ✅ Built | `src/components/analytics/records-tab.scale.test.tsx` | Render budgets at 500 / 5 000 / 50 000 records. Measured locally: 560 ms at 5 k. |

### Skipped (with reasons)

| Paradigm | Why not yet |
|---|---|
| **§2.4 Layer B** Promptfoo red-team | Costs live Claude API spend. Belongs in nightly CI, needs budget conversation. |
| **§2.8** Visual regression | Needs seeded fixtures + frozen clock first; otherwise the maintenance overhead dominates the value. |
| **§2.9** Storybook play-function migration | Conditional on adopting Storybook for design too — the cost only justifies itself if Storybook is being used beyond testing. |
| **§2.10** k6 sync-route stress | Needs a preview-deploy strategy and a budget conversation. Single-user PWA today; revisit if multi-tenancy is ever in scope. |

### Headline finding

While running the conflict property test, fast-check **discovered a
real edge case in `/api/sync/push`'s LWW resolution**: when two ops
have identical `updatedAt` and the second is a tombstone, the tombstone
is silently dropped. Trace through the D-12 rules:

  - Rule 1 (existing tombstoned, incoming upsert) — doesn't fire,
    server's `deletedAt` is null.
  - Rule 2 (`incoming.updatedAt > existing.updatedAt`) — false on a tie.
  - Rule 3 (else: skip, keep server row) — fires; tombstone lost.

This is exactly the class of bug example-based tests can't catch because
no hand-picked scenario thought to test "tied updatedAt with one
tombstone arriving second." The property test ran 50 iterations and
shrunk to the minimal counter-example in 9 tries.

A dedicated regression test `I1-asymmetry` in the conflict-property file
locks in the current behaviour so the gap stays visible. Whether to add
a tombstone-precedence rule in `route.ts` (one-line change:
`if (op.row.deletedAt != null && clampedUpdatedAt >= existing.updatedAt) write`)
is a product call — this branch only surfaces the finding.

### Baseline mutation score (Stryker, sync engine)

Initial baseline (commit `6684a1f`, 473 mutants, 13:38 runtime):
**39.96%** — killed 185, survived 185, timed out 4, no coverage 99.

After three rounds of follow-up work, re-baselined (478 mutants, 19:54
runtime): **55.44%** — killed 263, survived 173, timed out 2, no
coverage 40. **+15.5 percentage points overall.**

Per-file breakdown (final):

| File | Score | Killed | Survived | No coverage | History |
|---|---|---|---|---|---|
| `sync-queue.ts`  | **100.00%** | 25  | 0   | 0  | 88% → 100% via 3 targeted tests in `c485a6d` |
| `sync-engine.ts` | **52.56%**  | 183 | 127 | 40 | 40% → 53% via 8 failure-path tests in `0579eca` |
| `sync-payload.ts`| **54.46%**  | 55  | 46  | 0  | 26% → 54% — **doubled** by the property tests in `2482012` |

Survived-mutant types (top 5, whole suite):

  StringLiteral × 49 — literal strings changed, no assertion noticed
  ConditionalExpression × 46 — `if` turned to `false`, code paths skipped silently
  BooleanLiteral × 33 — true/false flipped
  ObjectLiteral × 29 — fields removed from returned objects
  BlockStatement × 10 — function bodies emptied

What these mean concretely:
  - `sync-queue.ts:62` — the `if (existing.op === op)` body can be
    emptied and no test fails. The same-op coalesce-enqueue path has
    no assertion that proves the enqueuedAt was actually bumped.
  - `sync-queue.ts:95` — the `if (queueIds.length === 0) return;`
    early-out can be replaced with `if (false) return;` and no test
    fails. The empty-ack path isn't covered.
  - 99 mutants in `sync-engine.ts` have no test coverage at all —
    likely the error / backoff / failure-mode paths. The happy-path
    push/pull is well-tested; the un-happy ones less so.

What I'd recommend:
  1. **The loop works on all three files.** Each round confirmed it:
     - `sync-queue.ts`: 3 targeted tests → 88% to 100% (`c485a6d`).
     - `sync-engine.ts`: 8 failure-path tests → 40% to 53% (`0579eca`).
     - `sync-payload.ts`: 12 property tests → 26% to 54% (`2482012`,
       remeasured after the fact).
     The pattern is identical: read survivors → write tests that kill
     them → score moves. No magic, just discipline.
  2. **What's left on `sync-engine.ts`** — 127 surviving mutants are
     mostly module-level state flags (engineStarted, pushInFlight,
     etc.); flipping them in isolation doesn't break the happy path
     in any single test. Closing them requires life-cycle property
     tests over arbitrary operation sequences. The cost/benefit is
     mediocre — recommend stopping at ~53% here unless a real bug
     surfaces in this area.
  3. **What's left on `sync-payload.ts`** — 46 survivors are mostly
     string-literal mutants on error messages, and ObjectLiteral
     mutants where the test asserts `success: false` without
     inspecting the issue codes. Closing these would mean asserting
     on Zod issue paths explicitly (e.g. `issue.path[0] === "ops"`).
     Modest effort, ~70-80% score achievable.
  4. **Gate semantics**: don't pin an absolute floor. Use ratchet
     semantics — gate on "score did not drop" the same way the
     coverage ratchet works in `vitest.config.ts`. The current
     scores (100% / 53% / 54%) become the floor.
  5. **Run nightly**: `.github/workflows/mutation.yml` is wired up
     (commit `4d95558`) to run at 03:00 UTC + on demand. The score
     table posts to the workflow summary; HTML report uploaded as
     an artifact.

### Quickest follow-ups if the work continues

1. ~~Run `pnpm test:mutation` baseline~~ — ✅ Recorded above. See
   `.stryker-tmp/mutation/index.html` for the per-mutant HTML report
   (gitignored).
2. ~~Decide on the tombstone-on-tie behaviour~~ — ✅ Fixed in
   `104c581` (rule 2b in `/api/sync/push/route.ts`).
3. ~~Triage the axe-core output~~ — ✅ Jsdom triage shipped in
   `fd62f7c` (`src/__tests__/a11y/components-a11y.test.tsx`). Three
   components have critical `button-name` violations
   (LiquidsCard×4, FoodSaltCard×1, WeightCard×2) and two have
   serious `aria-progressbar-name` violations (LiquidsCard×4,
   FoodSaltCard×2). Two distinct root causes — icon buttons without
   `aria-label` and Radix `Progress` components without an
   accessible name. The Playwright spec stays as the source of
   truth for full-page contrast / landmark checks.
4. ~~Add a second MSW integration flow~~ — ✅ Wizard flow shipped in
   `e6fba9f`.
5. **Re-run mutation testing** after the sync-payload property tests
   land in the baseline measurement.
6. **Decide on the `__proto__` cursor finding** — already fixed
   defensively in `2482012` (the route was never exposed but the
   schema now correctly rejects); leaving the strategy doc note here
   so the finding is tracked.

---

## References

- Kent C. Dodds — [Static vs Unit vs Integration vs E2E](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)
- BrowserStack — [Top Testing Libraries for React in 2026](https://www.browserstack.com/guide/top-react-testing-libraries)
- Nucamp — [Testing in 2026: Jest, RTL, Full Stack Strategies](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)
- fast-check — [Official docs](https://fast-check.dev/) and [GitHub](https://github.com/dubzzz/fast-check)
- Stryker Mutator — [TypeScript coverage analysis](https://stryker-mutator.io/blog/typescript-coverage-analysis-support/) and [OneUptime 2026 strategy guide](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- Storybook — [Component testing docs](https://storybook.js.org/docs/8/writing-tests/component-testing), [Red Hat behavioral verification engine](https://developers.redhat.com/articles/2026/04/29/how-we-turned-storybook-behavioral-verification-engine)
- Playwright — [Performance / parallel benchmarks 2026](https://testdino.com/blog/performance-benchmarks/), [Scalable Playwright Test Scripts 2026](https://www.browserstack.com/guide/playwright-scripts)
- Axe — [@axe-core/playwright integration guide](https://dev.to/vitalyskadorva/accessible-web-testing-with-playwright-and-axe-core-2kg1)
- Grafana k6 — [Docs](https://grafana.com/docs/k6/latest/), [Stress testing beginner's guide](https://grafana.com/blog/stress-testing/), [Performance testing best practices 2025](https://grafana.com/blog/2025/11/12/performance-testing-best-practices-how-to-prepare-for-peak-demand-with-grafana-cloud-k6/)
- Artillery — [Load testing with Playwright](https://www.artillery.io/docs/playwright)
- Offline-first / sync — [Sachith Dassanayake offline sync patterns 2026](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/), [DevelopersVoice offline-first sync patterns](https://developersvoice.com/blog/mobile/offline-first-sync-patterns/), [LogRocket offline-first frontend 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- PWA mobile — [Mobile Viewer PWA Testing Checklist 2026](https://mobileviewer.github.io/pwa-mobile-testing-checklist-2026)
- Chaos engineering — [Testomat 2026 chaos testing guide](https://testomat.io/blog/discover-the-power-of-chaos-testing-techniques/)
- LLM red-teaming — [Promptfoo red-team guide](https://www.promptfoo.dev/docs/guides/llm-redteaming/), [Unit 42 prompt fuzzing](https://unit42.paloaltonetworks.com/genai-llm-prompt-fuzzing/), [LLM JSON parser fuzzing arXiv](https://arxiv.org/pdf/2410.21806)
