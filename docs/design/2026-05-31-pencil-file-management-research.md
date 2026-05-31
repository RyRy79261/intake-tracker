# Pencil .pen File Management — Recommendation

Date: 2026-05-31
Author: Tech lead (research synthesis)
Status: Decision-oriented recommendation
Context: We drive the headless `@pencil.dev/cli` (pinned **0.2.5**; latest 0.2.7) with an
AI agent (Claude Code) to recreate this Next.js 16 / React / Tailwind / shadcn health PWA
as Pencil `.pen` files. `mcp__pencil__open_document` is disabled. We hit a machine-wide
singleton-canvas corruption when two `pencil` processes run at once. We currently have
~12-16 one-file-per-screen `.pen` files, which is unwieldy because the desktop app has no
file explorer.

---

## TL;DR — Recommendation

**Consolidate. Put all screens for an app area into a FEW multi-frame `.pen` files (not
one giant file, not ~16 tiny ones), and keep our PNG exports + per-screen specs as the
real durable source of truth.** Pencil's data model is explicitly built for many screens
("frames") on one infinite canvas in a single file — our one-file-per-screen layout is
working against the grain and is the direct cause of the "no file explorer" pain. There is
no separate "page" concept in Pencil (it is not Figma); **a "page" = a top-level Frame on
the canvas.** So yes, all screens can live in one file and be navigated together — but
because (a) `open_document` is disabled so the CLI can't merge across runs and (b)
concurrent runs corrupt the global canvas, the safe unit of work is **one `.pen` file
generated/regenerated in a single agent pass, fully serialized behind a lock.**

**Concrete primary recommendation for this repo:** group the ~16 screens into **5-6
domain files** (`auth.pen`, `dashboard.pen`, `medications.pen`, `analytics.pen`,
`settings.pen`, `edit-flows.pen`) plus a shared `_design-system.pen`, each holding its
several screens as named frames. Drive every run through `scripts/pencil/run.sh` (already
has the singleton guard), version-control the `.pen` files as opaque blobs alongside
committed PNG exports + the generating prompts, and pin the CLI version.

**Tradeoff being accepted:** because we can't merge, iterating on one screen means
re-running the whole file's prompt (the agent regenerates all frames in that file). That
is why the answer is "a handful of domain files," not "one mega-file" — it bounds the
blast radius of every regen and keeps each agent pass small enough to stay faithful.

Evidence strength: the *format supports many frames per file* is **well-documented**. The
*singleton-canvas corruption* and *encrypted-on-disk* behaviors are **observed / inferred,
undocumented by the vendor** — treat them as hard constraints we engineer around, not
vendor-blessed guarantees.

---

## 1. Can all screens live in ONE `.pen` file as navigable pages/artboards?

**Yes — and that is the intended structure.** This is the best-documented finding in the
research.

- A `.pen` document is a JSON object tree placed on a single **infinite 2D canvas**. The
  top-level `children` array holds many objects, each with `x`/`y` coordinates. **Each
  top-level `Frame` IS a screen/artboard**, sitting side-by-side as a sibling.
  (docs.pencil.dev — "The .pen Format": *"the top-level objects in a document are placed
  on an infinite two-dimensional canvas. They must have x and y."*)
- **There is no "page" container.** Unlike Figma's page tabs, "multiple pages" in Pencil
  literally means "multiple Frames on one canvas." You navigate them via the left-hand
  **layers/frame tree** plus pan/zoom (`1` = zoom-to-fit-all, `0` = 100%, Spacebar+drag =
  pan, Shift+scroll = horizontal pan). This directly fixes the "no file explorer" pain:
  open one file, see every screen.
- Official examples and third-party guides show the agent generating a whole multi-page
  site as "separate frames for each page inside the Pencil canvas" in a **single** file.

**How the agent builds it, given our two constraints:**

- **`open_document` disabled is NOT a blocker for authoring**, but it IS a blocker for
  *merging*. The CLI's own `--in` flag is a separate, working load path
  (`pencil --in x.pen --out y.pen --prompt "..."` — docs say contents are "preserved").
  However, in our agent harness the practical reality is: we cannot reliably read an
  existing multi-frame file and *append one frame* without the agent disturbing or
  rewriting siblings. So:
  - **Author all frames for a file in ONE agent pass** (one `--prompt`, or one `--tasks`
    entry, that emits every screen for that area as separate frames).
  - **Iterate in place** with `--in file.pen --out file.pen` — but expect the agent to
    regenerate the whole file, so keep files small enough that a full regen is cheap and
    stays faithful.
  - **Tell the agent to lay frames out on a non-overlapping grid** (e.g. ~1100-1300px
    apart horizontally, wrap rows every 4-5 frames) so screens don't collide on the
    canvas, and **name every frame** (e.g. `Dashboard`, `Add Medication — Step 1`)
    because the layers tree and prompts target frames by name.

**Why not literally one file for everything?** Nothing in the format forbids it, and there
is no documented frame-per-file limit. But (1) the desktop frame-navigation is basic — no
documented frame-search or "jump to frame," so a 16-frame canvas is navigable but not rich
— and (2) because we regenerate-not-merge, a single mega-file means every tweak re-runs all
16 screens in one pass, which strains agent context/fidelity. **A handful of domain files
is the sweet spot.** (Evidence: format = documented; navigation-doesn't-scale-gracefully
and regen-cost = inferred/observed.)

---

## 2. Is "recreate the existing app" the INTENDED way to use Pencil?

**Yes — recreating an existing app is a first-class, documented Pencil workflow.** Our
one-file-per-*screen* layout is the only part that's off-pattern.

- Pencil is positioned as bidirectional "design-as-code": Design→Code *and* Code→Design.
  The AI-integration docs list **"Import existing app"** as an advanced workflow with
  verbatim, caveat-free example prompts: *"Recreate all components from src/components in
  Pencil," "Import the design system from our Tailwind config," "Analyze the codebase and
  create matching designs."* That is exactly our goal.
- The headless agent-driven CLI itself is a documented, intended interface (npm: *"CLI
  tool for running the Pencil AI agent manipulating .pen design files"*; runs "the same
  editor engine as the desktop app, fully headless"). It is, however, the **youngest and
  least-emphasized surface** — first-party docs lead with the IDE extension (Cmd/Ctrl+K).
  So we are on the happy path, just on its newest lane.
- **Off-pattern part:** one-file-per-screen. The format wants a `.pen` to be a cohesive
  multi-frame design system with document-wide variables/themes. Consolidating (Q1/Q6) is
  the fix.

Better-supported pattern to adopt: **shared design-system file via document variables.**
Define tokens (colors/type/spacing) once — ideally in `_design-system.pen` — and have
screens reference them. (Note: cross-file `imports` composition is documented in the
format but **unconfirmed for the headless CLI** — see Open Questions.)

---

## 3. How to drive the CLI day-to-day, and live with the singleton constraint

**Three documented modes, mapped to us:**

| Mode | Command | Use for |
|---|---|---|
| One-shot | `pencil --in a.pen --out b.pen --prompt "…" --export img.png` | Generate or regenerate a single file. **Our default.** |
| Batch | `pencil --tasks batch.json` | Generate several files in one invocation. **Sanctioned multi-design path — runs SEQUENTIALLY, each task gets its own editor instance.** |
| Interactive | `pencil interactive -i in.pen -o out.pen` | Scripting/debugging via MCP tools. Rarely needed for us. |

**Recommended day-to-day:** one-shot per domain file for normal work; `--tasks` for a full
rebuild (one task per domain file). **Stop hand-rolling a loop of separate `pencil`
processes** — `--tasks` is the vendor's answer to "many designs" and is guaranteed
sequential with isolated editor instances.

**Living with the singleton canvas (the hard constraint):**

- The corruption is **real but undocumented.** Pencil publishes nothing about a global
  canvas, locking, or concurrency. The only multi-design mechanism (`--tasks`) is
  explicitly sequential — strong indirect confirmation that the engine assumes one active
  editor. Two `pencil` processes (even across different projects/branches) collide.
- **Hard invariant: never run two `pencil` processes at once.** Our
  `scripts/pencil/run.sh` already enforces this with a machine-wide `pgrep` guard on
  `@pencil.dev/cli/dist/index.cjs` (overridable via `ALLOW_CONCURRENT_PENCIL=1`). Keep
  it; consider upgrading `pgrep` to a real `flock` lockfile so a queued run *waits* rather
  than *fails* (current behavior exits 1). Always route through `run.sh` —
  **never call `pencil` directly.**
- **Background/parallel design jobs are forbidden.** No daemon/server/parallel CLI mode
  exists or is on any roadmap we could find.

**Auth:** stored session at `~/.pencil/session-cli.json` for interactive use;
`PENCIL_CLI_KEY` (+ `ANTHROPIC_API_KEY`) for unattended/CI, which overrides the session.
Add a `pencil status` preflight to fail fast on auth drift.

---

## 4. Version control for `.pen` files

**Git is the *only* sanctioned version-control mechanism** — Pencil has no cloud
multiplayer ("Collaboration via Git only," "no real-time multiplayer," "no auto-save").
But the diff/merge promise is largely **aspirational for our setup:**

- **Contradiction in Pencil's own surfaces:** marketing/core-concept docs call `.pen`
  "plain, text-based JSON… view diffs in Git," while the MCP server's own runtime
  instructions (active in this environment) and the `pencil-sync` docs state *".pen files
  are encrypted… the Pencil MCP server is the only supported way to read or write their
  contents."* Both can't be fully true. **Working assumption: the on-disk payload is
  opaque/encrypted, so line-level git diffs and 3-way merges will be NOISE.** (This is the
  single cheapest thing to verify directly — see Open Questions.)

**Therefore, our git posture:**

1. **Treat `.pen` as opaque binary.** Add `*.pen binary` (or `-diff merge=binary`) to
   `.gitattributes` so git never attempts a corrupting auto-merge and stops pretending to
   text-diff them.
2. **Commit deterministic PNG/PDF exports alongside** every `.pen`. The exports are the
   human-reviewable artifact — the only way to get a real "design diff in the PR."
3. **Commit before every agent run.** Because `open_document` is disabled and `--out`
   *replaces* (doesn't merge), git is our **only undo** if a regen drops content. Make
   `run.sh` refuse to run on a dirty tree (or auto-snapshot first).
4. **"Last-writer-owns-the-file" discipline.** Never rely on git's 3-way merge for `.pen`.
   Resolve any conflict by picking one whole file (ours/theirs) and re-running the prompt
   for the lost changes. Keep related-but-independently-edited screens in *separate* files
   so two runs never need to write the same opaque blob.
5. **Commit the generating prompts/`--tasks` JSON.** Since we can't reliably diff/merge
   `.pen`, the prompts are our real reproducible source — if a file corrupts or a format
   break lands, we re-run the prompt rather than hand-merge an opaque blob.

Our existing `design/README.md` git policy already covers most of this; the additions are
the `.gitattributes binary` marker and committing the prompts.

---

## 5. Maturity, update-breakage & lock-in risk — and how to insulate

**Pencil is genuinely young and fast-moving; the agent-driven CLI is the youngest lane of a
young tool.** Our update-breakage worry is well-founded and partly vendor-acknowledged.

- **Cadence/maturity:** `@pencil.dev/cli` ~10 releases in ~71 days (0.1.0 on 2026-03-20 →
  0.2.7 on 2026-05-30). We're pinned to **0.2.5**; **0.2.7 is already out** (the live CLI
  even nags to update). Licensed `UNLICENSED` (proprietary), maker "High Agency, Inc.",
  **no public CLI changelog**, no team/SLA tier, company runway unknown. Public GitHub
  issues show live CLI breakage ("Pencil CLI cant save now," Windows `batch_design`
  failures, MCP bridge regressions).
- **Format instability is vendor-acknowledged:** the `.pen` format docs (current version
  2.11) state verbatim *"we reserve the right to introduce breaking changes in the .pen
  format."* No deprecation window, no documented migration path. A future update could in
  principle make today's `.pen` files unopenable.
- **Lock-in is escapable but mostly via third parties:** first-party export is image-only
  (PNG/JPEG/WEBP/PDF) + AI design-to-code. Structure-preserving exits (Pencil→Figma
  plugins, ~90% claimed fidelity) and an MIT alternative ecosystem (OpenPencil, `.op` not
  `.pen`, CRDT concurrency) exist but are unverified for our files.

**Insulation strategy (this is the core hedge):**

1. **Code is the source of truth, not `.pen`.** We're recreating an *existing* app — the
   running Next.js app is canonical; `.pen` files are derived snapshots. Any format break
   is low-impact because we can regenerate.
2. **Keep the durable trio in git:** committed **PNG exports** (survive any Pencil break) +
   **per-screen specs/brief** (`docs/design/…-design-brief.md`) + **generating prompts**.
   If Pencil breaks or disappears, the *work* (the design intent and the visual record) is
   not lost — only the editable `.pen` is, and it's regenerable from the prompt.
3. **Pin the CLI exactly** (stay on 0.2.5; bump deliberately). **Gate every upgrade behind
   a smoke test:** regenerate one representative domain file, diff its PNG export, confirm
   `--in`/`--out`/`--export` still round-trip — *then* adopt. Never let CI float to latest;
   there is no changelog to warn us.
4. **Do a cheap portability dry-run now** (run one `.pen` through a Pencil→Figma importer)
   to confirm an exit ramp actually works before we depend on it.

**Verdict on "should we rely on it now?":** Defensible for our use case — single-user,
agent-driven, recreating an existing app's UI as *derived design artifacts*. It is **not**
yet safe to treat `.pen` as a durable, authoritative design system of record, and not ready
for multi-designer collaboration. The insulation above makes a Pencil break an annoyance,
not a data-loss event.

---

## 6. Concrete recommended setup for THIS repo

**File layout** (replaces ~16 per-screen files; groups by app area to bound regen blast
radius):

```
design/
  _design-system.pen        # tokens, type scale, shared chrome, shadcn primitives (foundation)
  auth.pen                  # sign-in, sign-up, forgot/reset password   (09,10)
  dashboard.pen             # main intake dashboard                      (01)
  medications.pen           # schedule, compounds, prescriptions, titrations, wizard (02,03,04)
  analytics.pen             # summary, correlations, records, titration  (05,06)
  settings.pen              # settings, profile, help index/article      (07,08,11,12)
  edit-flows.pen            # edit water / weight / BP                    (14)
  reference/*.png           # real-app screenshots (fidelity source of truth) — KEEP
  exports/*.png             # Pencil renders, one per frame (human review) — COMMIT
  prompts/*.md              # the generating prompt per domain file — COMMIT (regen source)
docs/design/…-design-brief.md   # research-grounded brief — grounds every prompt
scripts/pencil/run.sh           # singleton-guarded wrapper — the ONLY entry point
```

This is **7 files instead of ~16**, each opening with all its screens visible — the
desktop "no file explorer" pain effectively disappears. (Drop the old
`design/intake-tracker.pen` master-canvas idea from the README: assembling all screens onto
one mega-canvas reintroduces the regen-cost problem. If a single human-browsable index is
still wanted, use the committed PNG exports as that index, not a `.pen`.)

**Naming:** lowercase domain filenames; descriptive frame names per screen
(`Sign In`, `Add Medication — Step 1`, `Analytics — Correlations`). Frame names are the
de-facto substitute for the missing frame-search.

**Regen workflow:**

1. `pnpm design:capture` → refresh `design/reference/*.png` (you run this; project
   convention is Claude does not start the dev server).
2. Build `_design-system.pen` once (tokens + shared chrome) via `run.sh`.
3. **Per domain file, one agent pass** authoring all its frames on a non-overlapping grid:
   ```bash
   scripts/pencil/run.sh \
     --in design/_design-system.pen \
     --out design/medications.pen \
     --workspace design/reference \
     --prompt "$(cat design/prompts/medications.md)" \
     --export design/exports/medications.png
   ```
   For a full rebuild, use one `--tasks batch.json` (one task per domain file) — sequential
   and isolated by design.
4. **Iterate in place** with `--in medications.pen --out medications.pen` and a refining
   prompt. Expect a whole-file regen; commit first so git can roll back.
5. **Review** by diffing committed `exports/*.png` against `reference/*.png` in the PR.

**Guardrails to add:**
- `.gitattributes`: `*.pen binary`
- `run.sh`: refuse on dirty tree (or auto-snapshot) + `pencil status` preflight; consider
  `flock` so concurrent runs *queue* instead of *fail*.
- Pin `@pencil.dev/cli@0.2.5`; upgrade only behind the smoke test in §5.

**Primary recommendation vs. the two tradeoff alternatives:**
- **Primary (recommended): 5-6 domain files + `_design-system.pen`.** Best balance —
  fixes file sprawl, keeps each regen pass small/faithful, bounds conflict surface.
- **Alt A — one mega-file:** maximally fixes "no file explorer," but every tweak regens all
  ~16 frames (context strain, lower fidelity, larger opaque blob churn). Only consider if
  the agent proves it can reliably append/edit single frames via `--in` without disturbing
  siblings (untested — see Open Questions).
- **Alt B — keep one-file-per-screen:** smallest regen blast radius and cleanest "last
  writer owns the file," but it's the status-quo pain (16 files, no explorer) and
  off-pattern. Reject unless consolidation proves to hurt fidelity.

---

## Open questions / things to verify directly in the app

These are the load-bearing unknowns; most are cheap to check and worth doing before
standardizing.

1. **Encrypted-vs-text on disk (5-min check, do this first).** `hexdump -C` / open one
   committed `.pen` in a text viewer: is it readable JSON or opaque? Decides whether
   `*.pen binary` in `.gitattributes` is mandatory (almost certainly yes) and whether any
   text-diffing is viable. *Evidence today: contradictory; assume opaque.*
2. **Does `--in` reliably append/edit ONE frame without rewriting siblings?** If yes, Alt A
   (mega-file) and incremental edits become viable. If no, our "regenerate the whole domain
   file" assumption stands. *Untested; not guaranteed by docs.*
3. **Frame navigation at scale in desktop.** Confirm whether the layers tree has search /
   jump-to-frame / double-click-to-zoom (undocumented). Determines comfortable max frames
   per file.
4. **Does the headless CLI honor cross-file `imports` composition?** If yes, a single
   `_design-system.pen` imported by domain files is cleaner than re-seeding tokens via
   `--in` each run. *Documented for the format; unconfirmed for the CLI.*
5. **`--tasks` isolation leak.** Confirm no global/singleton state leaks between sequential
   tasks within one process (docs say "its own editor instance"; unverified).
6. **Portability dry-run.** Run one `.pen` through a Pencil→Figma importer to confirm a
   real exit ramp before depending on it.
7. **Upstream report.** File the concurrent-process canvas-corruption with a minimal repro
   (GitHub `highagency/pencil-desktop-releases` / Discord). It's currently unreported;
   getting an official answer de-risks the whole workflow.

**Evidence legend:** *Well-documented* — format holds many frames/file; recreate-existing-
app is supported; CLI modes (`--in/--out/--export/--tasks`); git-only collaboration;
format reserves breaking changes; version cadence. *Observed/inferred (undocumented by
vendor)* — singleton-canvas corruption; encrypted-on-disk payload; regenerate-not-merge
cost; navigation-doesn't-scale.

---

## Sources

- Pencil docs — The .pen Format (infinite canvas, frames, version 2.11, "reserve the right
  to introduce breaking changes"): https://docs.pencil.dev/for-developers/the-pen-format
- Pencil docs — .pen Files (git-only collaboration, naming, no auto-save):
  https://docs.pencil.dev/core-concepts/pen-files
- Pencil docs — Design as Code (commit/diff/branch/merge .pen):
  https://docs.pencil.dev/core-concepts/design-as-code
- Pencil docs — Pencil CLI (`--in/--out/--prompt/--export`, `--tasks` "sequential, each its
  own editor instance", `--workspace`, `PENCIL_CLI_KEY`):
  https://docs.pencil.dev/for-developers/pencil-cli
- Pencil docs — AI Integration ("Import existing app": recreate components, analyze
  codebase, create matching designs): https://docs.pencil.dev/getting-started/ai-integration
- Pencil docs — Design ↔ Code (Code→Design recreate): https://docs.pencil.dev/design-and-code/design-to-code
- Pencil docs — Pencil Interface (layers tree, zoom/pan shortcuts):
  https://docs.pencil.dev/core-concepts/pencil-interface
- Pencil docs — Import & Export (PNG/JPEG/WEBP/PDF, design-to-code, Figma import):
  https://docs.pencil.dev/core-concepts/import-and-export
- Pencil docs — Troubleshooting (no concurrency/singleton/file-explorer guidance):
  https://docs.pencil.dev/troubleshooting
- @pencil.dev/cli — npm / registry (v0.2.7 latest, UNLICENSED, High Agency Inc., version
  timestamps): https://www.npmjs.com/package/@pencil.dev/cli  •  https://registry.npmjs.org/@pencil.dev/cli
- pencil-sync (libraries.io) — ".pen files are encrypted; MCP-only access"; conflictStrategy:
  https://libraries.io/npm/pencil-sync
- highagency/pencil-desktop-releases — issues ("Pencil CLI cant save now", batch failures,
  MCP regressions; NO concurrency issue filed): https://github.com/highagency/pencil-desktop-releases/issues
- Pencil MCP server runtime instructions (this environment): ".pen files are encrypted and
  can only be accessed via the pencil MCP tools. DO NOT use Read or Grep."
- Better Stack — Pencil: Agent-Driven Design Tool (multi-frame-per-file; "still young"):
  https://betterstack.com/community/guides/ai/pencil-ai/
- Jerad Bitner — Designing with Pencil and Claude Code (importable library .pen):
  https://jeradbitner.com/2026/04/designing-with-pencil-and-claude-code/
- Pencil → Figma importer (third-party, ~90% fidelity escape hatch): https://penciltofigma.com/
- OpenPencil (MIT, .op, CRDT concurrency — alternative, NOT the official CLI):
  https://github.com/ZSeven-W/openpencil
- Pencil reviews (crashes/no-autosave/early-stage): https://www.banani.co/blog/pencil-dev-review
