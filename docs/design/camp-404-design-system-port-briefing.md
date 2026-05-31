# Briefing — Port the Pencil design-system capture + generation workflow to **Camp 404**

**Audience:** the Camp 404 team (and/or its Claude Code agent).
**Reference implementation:** `intake-tracker` (local checkout,
branch `claude/pencil-cli-integration`). Every path in §1–§8 is real and current there.
**Target:** `camp-404` — mapped to its real files in §9.

**Status of the reference impl (honest) — read this before trusting the word "recreation":**
the *tooling* is built and verified, but be clear-eyed about what the Pencil step actually does:

- **The Pencil CLI GENERATES; it does not TRACE.** Even with the exact screenshot *and* exact
  tokens in the prompt, it re-draws a *new approximation* — it drifts on colors, gradients,
  spacing, and element placement, and can drop or invent features. **It does not produce a
  faithful pixel-clone of an existing UI, and no amount of prompt-tuning makes it one.** This
  workflow is genuinely good for **capturing clean references, extracting tokens, and
  generating design *candidates* / alternatives / a fast starting point** — it is **not** a
  reliable way to replicate an existing screen 1:1. (We learned this the hard way: early
  "faithful" claims here were wrong.)
- **For a truly faithful recreation**, you need a *deterministic* approach — extract the real
  rendered DOM (geometry + computed styles + text, via Playwright) and build the `.pen` frames
  from that, instead of asking the AI to redraw a picture. That exporter is **not built here**;
  treat pixel-faithful 1:1 recreation as **out of scope** for this generate-from-prompt workflow.
- Mechanics still pending live proof: *does Pencil cleanly re-open a hand-merged `.pen`* —
  **not yet live-verified** (see §11). Prove that early.

> **Read order:** §1 (pipeline) → **§8 (Pitfalls)** → **§9 (Camp 404 specifics)** → §10
> (steps). The pitfalls and the Camp-404 differences are where the time goes.
> This doc doubles as a prompt — hand it to Camp 404's agent and point it at both repos.

---

## 1. The pipeline

Turn an **existing running app** into a **design system** (one navigable Pencil file +
PNG exports + extracted tokens), then implement components from it.

```
design brief → extract tokens (from code) → Playwright capture (SEEDED, clean, themed)
   → per-screen Pencil generation (anchored to screenshots + exact tokens, NO invented chrome)
   → merge screens into ONE .pen (non-destructive JSON merge)
   → verify each export vs its reference → implement components from exports + tokens
```

Screenshots + extracted tokens *ground* the generation so output lands closer to the real
app — but the agent **re-draws from them, it does not trace them**, so expect drift (see the
Status note above and §6/§8.5). The screenshots are the fidelity *reference you check against*,
not a guarantee of fidelity. The merge tool then gives one openable file instead of dozens.

---

## 2. The intake-tracker reference files (read these here)

| File | What it does |
|---|---|
| `scripts/pencil/run.sh` | `pencil` CLI wrapper: PATH + **singleton-canvas guard** (refuses to start if another `pencil` runs). |
| `scripts/pencil/merge-pens.mjs` | Non-destructive JSON merge of N single-frame `.pen` files into one canvas (packs frames, reads real heights from export PNGs, unions `variables`, unique ids, validates, never touches sources). |
| `scripts/pencil/capture.config.ts` | Dedicated Playwright config (seeded-auth globalSetup, mobile viewport, `colorScheme`, `webServer`). |
| `scripts/pencil/capture-setup.ts` | Lightweight auth globalSetup (sign-in + `storageState`, skips heavy DB seeding). |
| `scripts/pencil/capture-screenshots.ts` | **The harness** — seeds data via UI, then captures clean page + chrome + edit/dialog/wizard states. |
| `package.json` `design:capture/cli/status` | npm entry points. |
| `design/README.md` | Day-to-day workflow doc. |
| `.claude/agents/pencil-designer.md` | CLI-driven design subagent. |
| `docs/design/2026-05-30-…-design-brief.md` | Example research-grounded brief (template). |
| `docs/design/2026-05-31-pencil-file-management-research.md` | One-file-with-frames vs many; CLI modes; git posture; maturity hedge. |
| `docs/design/pen-merge-tool.md` | Merge-tool spec. |

`merge-pens.mjs` and `run.sh` port near-verbatim. **Everything else is a rewrite** for
Camp 404's domain (see §9).

---

## 3. Prerequisites

```bash
npm i -g @pencil.dev/cli          # global tool
pencil login                      # stores ~/.pencil/session-cli.json
pencil status                     # expect: ● Active
```
- `PENCIL_CLI_KEY` (+ `ANTHROPIC_API_KEY`) for CI; overrides the stored session.
- **Pin the CLI version** (we used `0.2.5`). No public changelog — gate upgrades behind a
  smoke test.
- Each generation runs a ~1–4 min Claude-agent loop and **must run one at a time** (§8.1).

---

## 4. The Playwright capture harness — the clean-capture rules

These rules separate usable references from garbage. (Camp 404's *seeding mechanism*
differs — see §9 — but the capture rules are the same.)

1. **Seed real data first.** Empty screens are useless. Drive flows that populate the app.
   *(intake-tracker: log entries via UI. **Camp 404: call `/api/test/*` seed routes** — §9.)*
2. **Mock AI/non-deterministic endpoints** for determinism (`page.route(...)`).
3. **Dismiss intro dialogs/banners first** (click "Got it" / dismiss, then `Escape`).
4. **Hide `position:fixed` floating bars before a full-page shot** — Playwright renders
   them *through* the scrolled content. Inject `[class~="fixed"]{display:none !important}`
   for the body shot; take a separate **viewport "chrome" shot** for the fixed bars.
5. **Capture states, not just routes:** inline edits, dialogs/sheets, multi-step wizards.
6. **Set the theme explicitly** via `colorScheme` (Camp 404 is **dark-only**).

---

## 5. Extract the real design tokens

Pencil drifts on color/gradient/spacing if described loosely — pass **exact** values from
code in the brief and every prompt. *(Camp 404's token source + concrete OKLCH values: §9.)*

---

## 6. Recreate each screen (one at a time)

```bash
scripts/pencil/run.sh \
  --out design/pages/<screen>.pen \
  --workspace design/reference \
  --prompt "$(cat design/prompts/<screen>.md)" \
  --export design/pages/<screen>.png
```
Prompt rules:
- **Anchor HARD to the screenshot** ("Reproduce `<ref>.png` exactly; do not redesign").
- **Pass exact tokens** (§5/§9) as backup. **State the theme** (Camp 404 = dark).
- **Forbid invented chrome explicitly** — Pencil adds a status bar / 9:41 clock / battery /
  bottom tab bar your app doesn't have.
- It's **generate-from-prompt = approximation, not a pixel clone** (see the Status note). The
  prompt rules above push it *closer*, but it will still drift and occasionally drop/invent
  features — this is a limit of the mechanism, not a tuning gap. Always `--export` and compare
  side-by-side; never claim "faithful" without looking. **If you need 1:1 fidelity, this step
  is the wrong tool** — use the deterministic DOM→`.pen` approach (out of scope here).

---

## 7. Merge into one file

The CLI **cannot merge** `.pen` files (`open_document` disabled) and concurrent runs
corrupt the canvas — so generate separately, then:
```bash
node scripts/pencil/merge-pens.mjs --out design/app.pen design/pages/
```
Facts it relies on (verified): `.pen` is **plain JSON** on disk (the "encrypted/MCP-only"
note is wrong for CLI files); each screen is **one frame at `x:0,y:0`** (naive concat
overlaps at origin); **auto-sized frames omit `height`** so the tool reads the **export
PNG height** (keep each `<screen>.png` next to its `.pen`); canvas is effectively infinite
but it packs within 8192² and warns instead of overlapping.

---

## 8. PITFALLS (read first) — discovered the hard way

1. **Singleton canvas (the big one).** Pencil's engine is a **machine-wide singleton**:
   two `pencil` processes at once — *even across different repos* — share one global canvas
   and corrupt each other (this merged our screens **and bled a parallel `noble-and-co`
   session into ours**). **Never run two at once.** Always route through `run.sh`
   (`pgrep` guard; override only via `ALLOW_CONCURRENT_PENCIL=1`). Don't run while anyone
   else uses Pencil on the machine.
2. **CLI can't merge `.pen`** (`open_document` disabled) → use the JSON merge tool.
3. **`.pen` is plain JSON on disk** despite the MCP "encrypted" claim → read/merge directly;
   git-diffs are real; don't mark binary.
4. **Pencil invents phone chrome** → forbid it in every prompt.
5. **Generate-from-prompt drifts and is NOT faithful** (color/gradient/order/size, dropped/
   invented features) — a **hard limit of the mechanism** (it redraws, doesn't trace), not a
   tuning gap. Anchor to screenshots + exact tokens, verify side-by-side, don't over-claim (we
   did, early — it was wrong). For true 1:1 recreation use a deterministic DOM→`.pen` exporter
   (out of scope here); use *this* workflow to generate candidates/alternatives, not clones.
6. **Full-page shots render `position:fixed` bars through content** → hide `.fixed` (§4.4).
7. **Empty data → useless refs** → seed first.
8. **Intro banners block the page** → dismiss before capturing.
9. **Auto-sized frames omit `height`** → packing must use the export-PNG height or tall
   pages overlap their neighbors.
10. **Server auth/seed can fail without breaking the UI** → use a *lightweight* capture
    setup that gets a session and skips anything brittle (see §9 for Camp 404's seam).
11. **`pnpm install` re-activates husky** → pre-commit runs the full test suite → commit
    design assets with `git commit --no-verify`.
12. **Stale `node_modules`** → `pnpm install` before capturing.
13. **Don't leave a dev server running**; `design:capture` starts a transient one.
14. **Pencil is young** (CLI 0.2.x, no public changelog; format "reserves breaking
    changes") → pin the version; smoke-test upgrades.
15. **Durable source of truth = the app + committed PNG exports + prompts + brief — NOT the
    `.pen`.** Keep all four in git; regenerate from the prompt if a file breaks.
16. **~1–4 min/screen, strictly serial.** Use Pencil's `--tasks` JSON for a sequential
    batch rather than hand-rolling parallel processes.

---

## 9. Camp 404 — your actual equivalents & specifics

### Profile
Camp 404 is a **Turborepo + pnpm-workspaces monorepo** (pnpm 10.33.0, Node ≥22) running
**Next.js 16.2.6 / React 19.2.6 / Tailwind v4 / shadcn-style `@camp404/ui`**. The web app
is `apps/web` (3 apps: `web`, `mobile`, `admin-cli`; 7 packages). Dev:
`pnpm --filter @camp404/web dev` (`next dev --port 3000`); e2e:
`pnpm --filter @camp404/web test:e2e` (Playwright, serial, 1 worker).

**Biggest architectural difference:** Camp 404 is **server-only** (Neon Postgres via Neon
Auth / Better Auth), **not local-first/IndexedDB** like intake-tracker. For tests/captures,
all state lives in an **in-memory test store** (`apps/web/lib/test-store.ts`, a `globalThis`
singleton) gated by `E2E_TEST_MODE=1` and seeded **exclusively through `/api/test/*`
routes**. There is no DB seeding and no UI-log-style seeding to port → **seed via
`/api/test/*`, never via the data layer.**

### Mapping table — intake-tracker → camp-404
| intake-tracker (FROM) | camp-404 target (real path) | Note |
|---|---|---|
| `scripts/pencil/run.sh` | `scripts/pencil/run.sh` (monorepo root) | **CREATE**, port near-verbatim. `.mcp.json` already configures Pencil MCP. |
| `scripts/pencil/merge-pens.mjs` | `scripts/pencil/merge-pens.mjs` (root) | **CREATE**, port as-is. `design/` has **zero `.pen` yet** — nothing to merge until a first screen exists. |
| `scripts/pencil/capture.config.ts` | `apps/web/scripts/pencil/capture.config.ts` | **CREATE**. Reuse the existing `webServer` (`next dev --port 3000`, health `GET /api/health`), `workers:1`, `E2E_TEST_MODE=1`. **Override viewport to mobile** (see risks). |
| `e2e/global-setup.ts` + `capture-setup.ts` | `apps/web/scripts/pencil/capture-setup.ts` | **CREATE — rewrite, don't copy.** No globalSetup exists. Auth via cookie `POST /api/test/login` (sets `camp404_test_user`), then `/api/test/complete-onboarding`, `/api/test/set-rank`, `/api/test/set-approval`. Signatures in `apps/web/tests/e2e/_helpers.ts`. |
| `scripts/pencil/capture-screenshots.ts` | `apps/web/scripts/pencil/capture-screenshots.ts` | **CREATE — full rewrite.** `/api/test/reset` → login → complete onboarding → seed via `/api/test/*` → capture. Mirror the specs below. |
| `playwright.config.ts` | `apps/web/playwright.config.ts` (exists) | **Don't modify** — keep capture in the separate `capture.config.ts`. |
| `src/lib/card-themes.ts` | — | **No equivalent.** Camp 404 has a single global brand palette, no per-section theme maps. CREATE only if a screen needs multi-section theming (flag scope). |
| `src/app/globals.css` | `packages/ui/src/styles/globals.css` | Tokens live in the **UI package** (imported as `@camp404/ui/styles.css`). OKLCH `@theme` block, **dark-only**, Tailwind v4 (no `tailwind.config.js`). |
| `package.json` `design:*` | `apps/web/package.json` scripts | **CREATE all three:** `design:capture` → `playwright test --config scripts/pencil/capture.config.ts`; `design:cli` → `bash ../../scripts/pencil/run.sh`; `design:status` → `bash ../../scripts/pencil/run.sh status`. |

### Screens/routes to capture & recreate
17 page routes across three tiers (`camp_member` / `team_lead` / `captain`). Priority set:
- `apps/web/app/page.tsx` — role-gated home control panel (quadrant nav). **Seed a user
  per rank** (`/api/test/set-rank`) to capture all three layers (`dynamic = "force-dynamic"`).
- `apps/web/app/auth/page.tsx` + `app/auth/[path]/page.tsx` — sign-in / sign-up shells
  (`LandingHero` / `AuthShell`, unauthenticated).
- `apps/web/app/signup/required/page.tsx` — invite-gate form.
- `apps/web/app/onboarding/questionnaire/page.tsx` — multi-step `QuestionnaireWizard`
  (13 pages; capture step states).
- `apps/web/app/pending-approval/page.tsx` — pending/rejected (`/api/test/set-approval`).
- `apps/web/app/profile/page.tsx` + `app/profile/edit/page.tsx` — view + edit (avatar upload).
- `apps/web/app/notifications/page.tsx` — inbox.
- `apps/web/app/family-tree/page.tsx` — referral graph.
- `apps/web/app/tools/page.tsx` + `tools/forms/page.tsx` + `tools/invite/page.tsx`.
- `apps/web/app/captains/{camp-management,announcements,tools}/page.tsx` — captain-only.
- Dialog/overlay states: `report-bug-dialog`, `enable-push`, `acknowledgement-gate`,
  `feedback-gate`. UI primitives to recreate: `packages/ui/src/components/` (avatar, button,
  card, checkbox, input, label, select, slider, textarea, dialog, popover, command,
  combobox) + camp-custom `control-panel`, `control-grid`, `quadrant-nav`.

### Seed flows to mirror & endpoints to mock
**Mirror these existing specs** in `apps/web/tests/e2e/` (read them for the exact
`/api/test/*` call order):
- `authenticated.spec.ts` (invite gate + onboarding block), `onboarding-questionnaire.spec.ts`
  (the 13-page wizard; shortcut via `/api/test/complete-onboarding`),
  `announcements.spec.ts` (captain→member broadcast — publish before capturing the member
  inbox), plus `invite-tracking.spec.ts`, `signup.spec.ts`, `home.spec.ts`, `smoke.spec.ts`,
  `api.spec.ts`.
- Reuse helpers in `apps/web/tests/e2e/_helpers.ts`: `login`, `resetTestState`,
  `completeOnboarding`, `redeemInviteAtGate`, `setRank`, `logoutAll`.
- Test seams: `/api/test/{login,reset,seed-invite,complete-onboarding,set-rank,set-approval,inspect}`.
  Invite code `TEST-INVITE` is pre-seeded via `INVITE_CODES` in the playwright config.

**Endpoints to MOCK (blocking for deterministic captures):**
- `apps/web/app/api/voice/transcribe/route.ts` (Groq Whisper, `apps/web/lib/groq.ts`) → fixed text.
- `apps/web/lib/feedback-ai.ts` (`structureWithAi`, Anthropic haiku via `apps/web/lib/anthropic.ts`) → fixed output.
- `apps/web/app/api/uploads/avatar/route.ts` (Vercel Blob) → stub to avoid real uploads.
- Confirm Firebase Admin push registration is skipped under `E2E_TEST_MODE`.

### Design tokens to extract
All in **`packages/ui/src/styles/globals.css`** — a Tailwind v4 OKLCH `@theme` block
(no `tailwind.config.js`, **dark-only**):
- `--color-background: oklch(0.15 0.05 295)` (midnight-violet) · `--color-foreground: oklch(0.97 0.02 330)`
- `--color-primary: oklch(0.65 0.27 340)` (hot magenta) · `--color-accent: oklch(0.62 0.18 255)` (electric-blue)
- `--color-secondary: oklch(0.42 0.18 320)` · `--color-destructive: oklch(0.65 0.22 18)`
- `--color-card: oklch(0.26 0.08 295)` · `--color-muted: oklch(0.22 0.06 295)` · `--color-border`/`--color-input: oklch(0.35 0.1 305)` · `--radius: 0.625rem`
- Hex mirror (for Pencil/OG contexts) is hand-maintained in `apps/web/lib/og-image.tsx`
  (BG `#0d061e`, FG `#f7ecf3`, magenta `rgba(255,0,140,0.92)`, cyan `rgba(0,220,255,0.92)`)
  and `apps/web/app/manifest.ts` (`#0d061e`) — **a manual sync point; don't assume it
  auto-tracks the OKLCH tokens.** Reference docs: `docs/design-system.md`,
  `docs/design-tooling.md`. `components.json` at `packages/ui/components.json`.

### Camp-404-specific risks / blockers
- **BLOCKER — viewport.** `apps/web/playwright.config.ts` uses `Desktop Chrome`, but the
  app is mobile-first (`max-w-lg`). The new `capture.config.ts` **must override to mobile**
  (intake-tracker uses 430×932 @2x). Don't inherit the desktop project.
- **BLOCKER — auth rewrite.** Can't copy `capture-setup.ts`: Camp 404 uses cookie
  `/api/test/login`, not Neon-Auth browser sign-in. Rewrite against `_helpers.ts`.
- **BLOCKER — AI/upload mocks** (Groq transcribe, Anthropic feedback, Vercel Blob avatar)
  must be stubbed or captures are non-deterministic / hit real APIs.
- **Serial only.** The in-memory store is a `globalThis` singleton (`workers:1`,
  `fullyParallel:false`); capture must run alone and call `/api/test/reset` at suite start
  (no globalSetup does it for you).
- **No capture infra yet.** `scripts/pencil/` doesn't exist; `design/` has only
  `README.md` (zero `.pen`). `merge-pens.mjs` has no base until a first screen is produced.
- **Onboarding shortcut.** Verify `/api/test/complete-onboarding` lands on `/` with no
  redirect loop before relying on it for home/captain captures.
- **Monorepo path footgun.** Scripts at repo root, app at `apps/web`. Get `__dirname`/
  `testDir` and the `--config` relative path right; `design:capture` runs from `apps/web`.
- **Pencil CLI on `$PATH`.** `run.sh` needs the global `pencil` bin — document it in
  `AGENTS.md` (Camp 404 has **no `CLAUDE.md`**, only `AGENTS.md`).

---

## 10. Step-by-step for the Camp 404 team

1. Install + `pencil login`; **pin** the CLI version. Ensure `pencil` is on `$PATH`.
2. `CREATE scripts/pencil/run.sh` + `scripts/pencil/merge-pens.mjs` at the **monorepo root**
   (port from intake-tracker).
3. `CREATE apps/web/scripts/pencil/capture.config.ts` — reuse the existing `webServer`,
   `E2E_TEST_MODE=1`, `workers:1`, **mobile viewport**.
4. `CREATE apps/web/scripts/pencil/capture-setup.ts` — cookie `/api/test/login` +
   onboarding/rank/approval shortcuts (use `_helpers.ts`).
5. `CREATE apps/web/scripts/pencil/capture-screenshots.ts` — `/api/test/reset` → login →
   seed via `/api/test/*` (mirror the specs in §9) → capture per the §4 rules; **mock**
   the Groq/Anthropic/Blob endpoints.
6. Add the three `design:*` scripts to `apps/web/package.json`.
7. Extract the OKLCH tokens (§9) into a short brief.
8. `pnpm --filter @camp404/web design:capture` → review `design/reference/*.png` are
   **populated and clean** (no banners, no fixed bars through content, mobile width).
9. Generate each screen (§6), one at a time; export + eyeball vs the reference.
10. `node scripts/pencil/merge-pens.mjs --out design/app.pen apps/web/design/pages/` →
    open and confirm all screens present, non-overlapping.
11. Implement components (`packages/ui/src/components/`) from the exports + tokens.

---

## 11. Open questions / verify early in Camp 404

- **Live-verify the merge:** generate 2 screens, merge, confirm Pencil **re-opens**
  `design/app.pen` cleanly — *before* scaling (we had high confidence but hadn't run this
  live; each frame's inner content is byte-identical and multi-frame-on-one-canvas is the
  documented model).
- Confirm the `/api/test/*` seam covers every state you need to capture (esp. captain-tier
  + the 13-step questionnaire); add seams if not.
- Confirm `E2E_TEST_MODE` truly disables Firebase push + any other side-effecting init
  during capture.

---

*Distilled from the intake-tracker Pencil integration (branch
`claude/pencil-cli-integration`) + a 5-agent recon of `camp-404`. intake-tracker paths are
real on that branch; camp-404 paths are real as of this recon.*
