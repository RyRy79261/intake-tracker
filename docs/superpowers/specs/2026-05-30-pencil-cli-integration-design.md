# Pencil CLI Integration + Faithful App Recreation — Design Spec

- **Date:** 2026-05-30
- **Status:** Approved (design), pending spec review → implementation plan
- **Branch:** `claude/pencil-cli-integration` (branched off the current Google-Play release branch HEAD so the latest app code — Next.js 16, all routes — is available for screenshot capture)
- **Author:** Claude (brainstormed with Ryan)

---

## 1. Context & Motivation

`@pencil.dev/cli` is a **headless**, scriptable CLI for creating/editing `.pen` design
files (`pencil login`, `pencil --in/--out --prompt`, `pencil interactive`, `--export` to
PNG/PDF, `--tasks` batch JSON, `--workspace`). It is already installed
(`~/.local/share/pnpm/pencil`, v0.2.5; v0.2.7 available) and **authenticated**
(stored session at `~/.pencil/session-cli.json`, account ryanjnoble@gmail.com, default
model Claude Opus). Headless runs need no interactive login.

A prior Pencil effort (Phase 5.1) was **abandoned** because it used the *desktop app +
MCP* approach: heavy context overhead, components that didn't match the codebase, and —
critically — MCP tools unavailable to subagents. **The headless CLI removes exactly
those blockers**: it is scriptable, workflow-native, and needs no running desktop app.
This makes a clean, rigorous rebuild viable.

**Reference implementation:** `ryry79261/noble-and-co`
already uses this CLI well. Its pattern:
a research-grounded **design brief** (`docs/design/<date>-<project>-design-brief.md`) →
a single committed `design/<project>.pen` → iterative `design/exports/*.png` reviews →
`design/images/` assets, with the CLI used as a global tool (not a repo dependency). We
mirror this pattern.

**Existing artifact to supersede:** a 446 KB `design/app.pen` remains from the abandoned
effort; reportedly it does not match the codebase. **We start fresh**; the old file stays
in git history.

## 2. Goals & Non-Goals

### Stage 1 goals (this spec)
1. Integrate the Pencil CLI into the repo as a first-class, documented, repeatable
   workflow (directory structure, helper scripts, npm scripts, docs, refreshed agent).
2. Produce a faithful, coherent recreation of the **entire** app UI in one master
   `.pen`, grounded by (a) a research-backed design brief, (b) code-derived per-screen
   specs, and (c) real-app screenshots (the chosen **hybrid** source of truth).
3. Establish a reusable design-system foundation in Pencil that makes Stage 2 cheap.

### Non-goals (Stage 1)
- Generating *alternative* designs (that is Stage 2, brainstormed separately — its
  direction depends on what Stage 1 reveals).
- Changing any application/React code. This is a design-asset + tooling effort only.
- Pixel-perfect 1:1 cloning of every micro-interaction; we target faithful structure,
  layout, color, type, and component fidelity per screen + key states.

## 3. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Visual source of truth | **Hybrid** — code-derived specs as backbone + Playwright screenshots as per-screen visual reference |
| D2 | Design-research depth | **Full research workflow** — multi-agent scan of health-PWA/mobile/a11y patterns + codebase token extraction → one brief |
| D3 | Existing `app.pen` | **Start fresh**; old file kept in git history |
| D4 | Orchestration model | **(A)** Foundation built once → **parallel** per-screen generation (independent `.pen` files) → sequential **curated assembly** into master. **(B)** pure-sequential accumulation is the fallback if CLI cannot compose files. |
| D5 | CLI version | Recommend bumping `0.2.5 → 0.2.7` as an optional first step (latest fixes) |
| D6 | Dev server for capture | Not started by Claude; `pnpm design:capture` is **user-run** (or Claude runs it on explicit go-ahead) — honors the standing "never start the dev server" rule |

## 4. Architecture — what integration produces

```
design/
  intake-tracker.pen            # master canvas — THE deliverable (built fresh)
  screens/<name>.pen            # per-screen working files (parallel outputs)
  reference/<route>.png         # real-app screenshots (Playwright)
  exports/<name>.png            # Pencil-rendered exports (review loop)
  images/                       # logo / generated assets
  README.md                     # documents the CLI workflow (auth, commands, regenerate)
docs/design/
  2026-05-30-intake-tracker-design-brief.md   # research-grounded brief (the input that makes Pencil output good)
scripts/pencil/
  capture-screenshots.ts        # Playwright; reuses e2e seeded auth; mobile viewport; every route + key dialog states
  run.sh                        # thin pencil wrapper (PATH, --workspace, model, export defaults)
package.json scripts:
  "design:capture"  -> tsx/playwright run of capture-screenshots.ts
  "design:build"    -> drives recreation (workflow entry / run.sh batch)
  "design:export"   -> re-render master + screens to design/exports
.claude/agents/pencil-designer.md   # REWRITTEN for the CLI workflow (currently documents the dead MCP/desktop AppImage approach)
```

**Git policy:** commit `.pen` master + per-screen files, the brief, `design/README.md`,
the scripts, and a **curated** set of `reference/` + `exports/` PNGs. Gitignore scratch
PNGs (`design/exports/*-wip-*.png`, `~/.pencil` previews). Mirrors noble-and-co committing
its design file + a curated export set.

## 5. The Design Brief (D2)

A single `docs/design/2026-05-30-intake-tracker-design-brief.md`, produced by a **full
research workflow** (parallel agents: health-tracking/medical-PWA UX references, mobile
dashboard density & thumb-zone patterns, data-viz/analytics patterns, accessibility &
contrast for clinical data, offline/empty/error states) **fused with the real,
already-extracted design system** below. The brief grounds both the faithful recreation
and Stage 2 alternatives.

### Extracted design system (verified from the codebase — embed verbatim in the brief)

- **Font:** Outfit (`next/font/google`, latin), `--font-outfit` → `font-sans`; features
  `rlig 1, calt 1`.
- **Container:** `container mx-auto max-w-lg px-4` (≤512 px, 16 px gutters); sticky
  `AppHeader` (z-40); fixed bottom floating bars (safe-area inset).
- **Radius:** `--radius: 0.75rem` (lg=12px, md=10px, sm=8px). Card padding `p-6`;
  section rhythm `space-y-4` / `mb-6`.
- **Theme:** `next-themes`, class-based, `defaultTheme="system"`, `.dark` on `<html>`;
  all colors `hsl(var(--token))`.
- **Base tokens (light):** `--background 220 20% 97%`, `--foreground 220 20% 10%`,
  `--primary 220 70% 50%`, `--destructive 0 84% 60%`, `--border 220 15% 88%`,
  `--ring 220 70% 50%`. Dark: `--background 220 20% 8%`, `--foreground 220 10% 95%`,
  `--primary 210 100% 60%`, `--card 220 20% 12%`.
- **Domain (semantic) color tokens — the app's signature** (HSL, each with white/black fg):

  | Domain | Token | HSL | Reads as |
  |---|---|---|---|
  | Water | `--water` | `200 85% 55%` | sky/cyan |
  | Salt | `--salt` | `30 80% 55%` | golden/orange |
  | Weight | `--weight` | `160 84% 39%` | deep teal |
  | Blood pressure | `--bp` | `350 89% 60%` | rose/pink |
  | Eating | `--eating` | `25 95% 53%` | orange |
  | Urination | `--urination` | `258 90% 66%` | violet |
  | Defecation | `--defecation` | `33 25% 45%` | brown/stone |
  | Caffeine | `--caffeine` | `48 96% 53%` (black fg) | yellow |
  | Alcohol | `--alcohol` | `292 84% 61%` | fuchsia |
  | Medication | `--medication` | `168 76% 36%` | teal/green |

- **Primitives (26 shadcn/ui):** accordion, alert-dialog, badge, button, card, checkbox,
  collapsible, command, dialog, drawer, input, label, numeric-input, popover, progress,
  scroll-area, select, sheet, skeleton, switch, tabs, textarea, toast/toaster,
  inline-edit.
- **Signature patterns:** `CardShell` (gradient card: icon + label header + right-side
  stat/progress + body), tab-based card inputs, `RecentEntriesList` (swipe + inline
  edit rows), multi-stage `Progress` coloring (on-budget → extended → over-limit),
  `CollapsibleTimeInput` (backdating), floating bars (`HomeFloatingBars` =
  VoiceLaunchBar + QuickNavFooter; `MedicationsFloatingBars` = + FAB + wizard),
  `SwipeNav` horizontal gesture nav between top-level routes.

## 6. Recreation Pipeline (per screen)

1. **Foundation pass** — one CLI run builds a *design-system* artboard in Pencil: tokens
   (base + domain), type scale, shared chrome (AppHeader, QuickNavFooter, CardShell,
   core primitives). Reviewed and approved before screens are built. Output:
   `design/screens/_design-system.pen`.
2. **Capture** — `pnpm design:capture` (Playwright) logs in via seeded e2e auth, sets a
   mobile viewport, visits every route, and screenshots full-page **plus** key dialog/
   sheet/drawer states, writing `design/reference/<name>.png`.
3. **Generate** — per screen, run the CLI grounded by the foundation file as `--in`,
   the **code-derived spec** as `--prompt`, and the **screenshot** placed in
   `--workspace design/reference` as visual reference; `--out design/screens/<name>.pen`,
   `--export design/exports/<name>.png`.
4. **Verify** — compare each export against its reference screenshot; refine via
   follow-up CLI prompts until faithful.
5. **Assemble** — curate finished screens onto the `design/intake-tracker.pen` master
   canvas (one canvas, many artboards), arranged by group.

## 7. Orchestration Model (D4)

The CLI is single-file (`--in/--out`): **parallel writes to one `.pen` conflict.**

- **(A) — recommended.** Build `_design-system.pen` once (sequential). Then a **Workflow
  fans out** screen generation in parallel — each screen is an *independent* output file
  (`--in _design-system.pen --out screens/<name>.pen`), which is safe to parallelize and
  matches ultracode's fan-out model; each exports a PNG. Finally, a **sequential
  curated-assembly** pass places the finished screens onto the master canvas.
  - **Risk / verify early:** the CLI has no documented file *merge*. Assembly options to
    test in order: (i) `pencil --in master --out master --prompt "import/arrange the
    screen from screens/<name>.pen as an artboard at <x,y>"` with screen files in
    `--workspace`; (ii) batch `--tasks` JSON; (iii) if neither composes existing files,
    fall back to **(B)** for the master while keeping the parallel per-screen files as
    fast review artifacts.
- **(B) — fallback.** Pure sequential accumulation: each run adds a screen to the growing
  master (`--in master --out master`). Maximally coherent (each screen sees prior ones),
  exactly how `noble-and-co.pen` was built — but ~14 serial Opus runs.

## 8. Screen Plan — 14 artboards

Derived from the verified inventory. Each artboard = the screen's primary state; key
alternate states captured on a dedicated **states/dialogs** board.

| # | Artboard | Primary composition (real component names) |
|---|---|---|
| 0 | **Design System** | base + domain tokens, type scale, AppHeader, QuickNavFooter, CardShell, core primitives |
| 1 | **Dashboard `/`** | AppHeader → TextMetrics → Water (LiquidsCard: Water/Beverage/Coffee/Alcohol tabs) → Food+Salt (FoodSaltCard: salt/sugar/potassium) → BloodPressureCard → WeightCard → UrinationCard → DefecationCard → HomeFloatingBars (VoiceLaunchBar + QuickNavFooter) |
| 2 | **Medications — Schedule** | MedTabBar → WeekDaySelector → ScheduleView (time-slot groups, dose rows) → MedicationsFloatingBars (+ FAB) |
| 3 | **Medications — other tabs** | CompoundList/CompoundCard(Expanded), PrescriptionsView/PrescriptionCard, TitrationsView, MedicationSettingsView |
| 4 | **Add-Medication Wizard** | multi-step dialog (compound → schedule → dose → notifications) |
| 5 | **Analytics — Summary/Correlations** | TimeRangeSelector + ExportControls + Tabs; ChartCards, AiInsightsCard, NutrientAnalysisCard, CorrelationChart |
| 6 | **Analytics — Records/Titration** | filterable records table; TitrationTab timeline |
| 7 | **Settings** | AccountSection + accordion groups (AI, Data & Storage, Tracking ×8 subsections, Customization ×4, Medication, Privacy, System, Help, Feedback, Debug) + Reset/About footer |
| 8 | **Profile** | SignedOutBlurb / AccountSection + MedicalContextSection |
| 9 | **Auth — Sign in** | AuthShell + SignInForm (+ Google OAuth) |
| 10 | **Auth — Sign up / Forgot / Reset** | AuthShell + respective forms (one board, three frames) |
| 11 | **Help index** | HelpTopBar + HelpIndex (domain-grouped links) |
| 12 | **Help article `/help/[slug]`** | HelpTopBar + ManualView (markdown + ComponentPreview + callouts) |
| 13 | **Key dialogs / states** | ManualInputDialog, edit-* dialogs, HistoryDrawer, DoseDetailDialog; empty/loading/error states |

## 9. Screenshot Capture Harness

`scripts/pencil/capture-screenshots.ts` (Playwright):
- Reuses seeded auth: `playwright/.auth/user.json` via `e2e/global-setup.ts`
  (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`).
- Mobile viewport (e.g. 430×932, iPhone-class); theme coverage (dark-only vs dark+light) is configurable and set per §13.2 for v1.
- Visits every route; full-page screenshot to `design/reference/<route>.png`.
- Triggers + screenshots key overlays (manual-input, an edit dialog, history-drawer,
  dose-detail, add-medication wizard step 1) into `design/reference/<state>.png`.
- Run via `pnpm design:capture`. **User-triggered** (it auto-starts the dev server).

## 10. Verification & Definition of Done (Stage 1)

- Every artboard exported to PNG and reviewed **side-by-side** against its reference
  screenshot; no "done" claim without the comparison.
- Master `design/intake-tracker.pen` opens and contains all 14 artboards, coherent and
  on-token.
- `pnpm design:capture` runs green and populates `design/reference/`.
- Brief, README, scripts, npm scripts committed; `pencil-designer.md` rewritten for CLI.
- A short note added where the project documents tooling (e.g. CLAUDE.md design section)
  pointing at `design/README.md`.

## 11. Stage 2 — Alternative Designs (outline only; brainstormed later)

The design-system-first foundation makes alternatives cheap: swap tokens/type/texture or
restructure IA, then regenerate. Candidate directions to explore in the Stage-2
brainstorm: (a) **visual restyles** keeping IA (e.g. calm-clinical, bold high-contrast,
warm-playful); (b) **IA/layout variants** (bottom tab-bar vs swipe-nav; single-scroll vs
tabbed dashboard; density options); (c) a **net-new design language**. Out of scope here.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pencil output drifts from the real React UI | Screenshot grounding in `--workspace` + export-compare-refine loop |
| CLI cannot compose existing `.pen` files (blocks §7-A assembly) | Verify assembly path early; fall back to §7-B sequential master |
| Many Opus CLI runs = time/token cost | Accepted under ultracode; parallel fan-out (A) limits wall-clock; flagged |
| Dev-server start for capture violates standing rule | `design:capture` is user-run; Claude never auto-starts it |
| CLI session/auth expiry mid-run | `pencil status` precheck; document `PENCIL_CLI_KEY` for unattended runs |
| Bulky PNGs bloat the repo | Commit only a curated export/reference set; gitignore scratch |

## 13. Open Questions to Resolve During Execution

1. Does the CLI compose/import existing `.pen` files (determines §7-A vs §7-B)?
2. Exact mobile viewport + whether to capture both themes or dark-only for v1.
3. Whether the master should be one mega-canvas or a small set of grouped canvases.
4. Depth of dialog/state coverage on board #13 for v1 vs a follow-up pass.

## 14. Work Breakdown (for the implementation plan)

1. **Tooling setup** — branch (done), `design/` + `scripts/pencil/` scaffolding, npm
   scripts, `run.sh`, optional CLI bump, rewrite `pencil-designer.md`, `design/README.md`.
2. **Capture harness** — `capture-screenshots.ts`, verify it runs (user-triggered),
   populate `design/reference/`.
3. **Research brief** — full research workflow → `docs/design/...-design-brief.md` with
   embedded extracted tokens.
4. **Foundation** — `_design-system.pen`, reviewed.
5. **Per-screen generation** — code-derived specs + screenshots → 14 artboards via the
   chosen orchestration; export + verify each.
6. **Assembly** — curate into `design/intake-tracker.pen`.
7. **Verification + docs** — side-by-side review, commit curated assets, wire docs.
