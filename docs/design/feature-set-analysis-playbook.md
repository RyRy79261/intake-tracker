<!--
Title: Totalistic Feature-Set Analysis + Adversarial Verification — A Repo-Agnostic Multi-Agent Playbook
Purpose: Reproduce, on any codebase, a totalistic feature-set analysis (the "drop no functionality" functional contract) plus an adversarial verification pass — with copy-paste agent prompts and a runnable assembler.
Companion: docs/design/camp-404-design-system-port-briefing.md
-->

# Totalistic Feature-Set Analysis + Adversarial Verification — A Repo-Agnostic Multi-Agent Playbook

## 1. Title & Purpose

This playbook tells a team (and its fan-out of Claude Code agents) how to reproduce, on **their own codebase**, the *totalistic feature-set analysis + adversarial verification* method originally run on `intake-tracker`. Follow it end-to-end and paste its embedded prompt templates straight into agents.

**What this produces.** A *functional coverage map* of an entire application: for every load-bearing surface, an exhaustive, source-grounded document of its **features, user actions, states, enums/options/configurable values, data model, and validation/edge-case rules** — every number digit-exact, every claim cited to `file:line`. Then a **backward adversarial verification pass** that treats every claim as a hypothesis to refute against real code, scores accuracy, and (as a side effect) harvests real source bugs and dead code.

**Why.** The output is the **functional contract** that any rebuild or alternative design must satisfy: *"restyle freely, but DROP NO FUNCTIONALITY."* It lets a designer reimagine how a surface looks while guaranteeing every capability survives. The real run produced 46 unit docs + 1 overview, assembled into a ~10,610-line master brief, then verified by 47 adversarial agents across 4,220 claims (94.8% verified, 0 significant-gaps).

**Core philosophy (three rules that govern everything below):**
1. **Functional contract, not visual spec.** These docs say *what must exist*, never *how it must look*. Color, layout, typography, motion, nav metaphor are all free to change; features/actions/states/enums/validation are load-bearing.
2. **Source-grounded and digit-exact.** Every claim traces to real code. Copy literal numbers, enum members, tokens, schema fields, and formulas verbatim — never round, summarize, or infer from a name. Flag anything unconfirmed as low-confidence rather than guessing.
3. **Adversarially verified.** The source code is the source of truth; the feature-set doc is a *derived artifact*. A backward pass works from doc claims to source, defaulting to flagging, and certifies the brief reliable.

**How this composes with the Camp 404 port briefing.** This is the **analysis-method companion** to `docs/design/camp-404-design-system-port-briefing.md`. That briefing ports the *Pencil capture + generation pipeline* (Playwright harness → token extraction → per-screen `.pen` → merge) — i.e. *how it looks*. **This** method produces *what must exist*.

> **Important — the composition is one-directional today.** The briefing does **not** reference this method, the "functional contract", "drop no functionality", or any behavioral-coverage check (a grep of the briefing returns zero hits). The briefing's only verification step is `verify each export vs its reference` — **visual fidelity only** (exported `.pen` vs reference screenshot). There is **no cross-link in the briefing**, so the two methods must be **sequenced by the orchestrator**, not by either document.
>
> **The team must ADD the behavioral gate.** Run *this* method first to produce the unit docs, then run the briefing's pipeline, then add a **new verification step the briefing does not yet contain**: compare each generated `.pen` candidate against this method's unit docs to confirm every feature/action/state/enum/validation survives the restyle. The briefing checks "does the `.pen` match its reference screenshot"; you are adding "does the `.pen` preserve the functional contract these unit docs define." Neither substitutes for the other.

See §11 for how to consume Camp 404 facts already enumerated in the briefing rather than re-deriving them.

---

## 2. What You Will Produce — Artifact Set & Folder Layout

```
design/
  design-feature-set.md                   # ASSEMBLED master brief (build artifact; never hand-edit)
  feature-set-verification-report.md      # agent-assembled master verification report
  feature-set/
    00-overview.md                        # cross-cutting frame (own agent)
    01-<slug>.md                          # one per load-bearing unit
    02-<slug>.md
    ...
    NN-<slug>.md
    verification/
      00-<slug>.md                        # one adversarial report per unit doc (+ overview)
      01-<slug>.md
      ...
      NN-<slug>.md
```

| Artifact | Producer | Editing surface? |
|---|---|---|
| `feature-set/NN-<slug>.md` (per-unit docs) | one agent each, parallel | **Yes — this is where you edit.** |
| `feature-set/00-overview.md` (overview frame) | its own agent | Yes |
| `design-feature-set.md` (assembled master) | a deterministic assembler script **you write** (see §6) | **No — regenerable build artifact.** Edit the units, re-assemble. |
| `feature-set/verification/NN-<slug>.md` (per-unit verifier reports) | one verifier agent each, parallel | No (generated) |
| `feature-set-verification-report.md` (master report) | one consolidation agent | No (generated) |

The **unit file is the working unit**; the master is a build artifact too large to read whole or hand-edit (the real one is ~10,610 lines / 47 sections, which exceeds a single safe read budget). Unit files run a few hundred lines and read in one shot.

> **Note on portability of artifacts.** The per-unit docs, the overview, and the prompt templates below are portable artifacts you can read and adapt. The **assembler is NOT a portable artifact** — no assembler script exists in the reference repo (the master carries the banner but was assembled ad-hoc). §6 gives the full deterministic spec **and a runnable script** so a fresh team writes their own.

---

## 3. Phase 0 — Decompose the Codebase into Units

The fan-out is only as good as the decomposition. Before spawning anything, the orchestrator (you, in the main conversation) does one scouting pass and produces a **unit manifest**: an ordered list of `{ NN, slug, unit_name, entry_files[], one_line_purpose }`. This manifest directly determines the number of agents.

### 3.1 What qualifies as one "unit"

A **unit** = exactly **one load-bearing surface**: a coherent slice of the product where a user (or the system) does real work, plus all the code that powers it. "Load-bearing" means functionality that must survive any redesign — not decoration. The defining test is *"is there a distinct contract here that a redesign must not break?"* — **not** *"is there one file?"*. A unit may span many files (the real Water unit lists ~20: card, 3 tab components, dialog, list, 6 hooks, 7 lib services, db, store) and may be entirely non-visual (a pure data-model or engine spec).

In practice a unit is one of:
- **A per-domain input/display surface** — one card/screen for one tracked thing. One domain → one unit even if it spans several files.
- **A shared display/interaction pattern reused across surfaces** — a primitive several surfaces lean on (recent-entries list + inline edit, history drawer, card-shell + theming, a text-metrics summary, voice entry).
- **A multi-step flow** — a wizard or migration flow.
- **A sub-tab or sub-view of a larger route** — e.g. Analytics split into Summary / Correlations / Records / Titration / Controls+Export / Engine, each its own unit.
- **A settings group** — **split a settings surface into N themed groups where each fits one agent's exhaustive pass.** (The exact N is an app artifact, not a sizing rule. In the real run a settings accordion of ~10 UI groups was collapsed into 6 unit docs plus a profile unit — see §3.4.)
- **A cross-cutting system with no single screen** — auth, navigation chrome, global dialogs/feedback, sync, the canonical data-model+enums, the settings-store+enums, push notifications, backup/restore, daily notes, debug tools, an embedded server, etc.

### 3.2 How granularity is chosen

The single sizing constraint: **a unit must be small enough that one agent can exhaustively document it in a single pass, citing every file:line, without dropping fidelity.** Concrete bounds:
- One unit per agent. Docs run ~80–300 lines; verification typically finds tens-to-low-hundreds of *claims* per unit. (Real run: from **41** claims for the smallest unit (00 overview) and **47** (43 daily-notes) up to **120** (45 mcp-server) and **121** (39 data-model-enums); most units land in the ~78–118 band.) That breadth is the sweet spot where an agent stays digit-exact; if a single unit would push well past ~120 claims, split it.
- **Split when** a surface would exceed that — Analytics, Medications, and Settings were each split into 5–7 units rather than written as one giant doc. (A card with 4 input tabs stays one unit, because the tabs share one budget/progress bar/recent list — sub-components, not separate units.)
- **Merge/extract when** a behavior is reused everywhere — recent-entries+inline-edit became its own unit instead of being re-documented in six input cards; card-shell+theming and the data-model each became their own unit.
- **Sizing heuristic:** if a unit's entry-file set spans more than ~6–10 files or two clearly separable surfaces, **split**. If two units would share >50% of their files and read as one screen, **merge**.
- **Rule of thumb:** one route, or one sub-tab, or one reused primitive, or one cross-cutting system = one unit. If a route has tabs, each tab is usually a unit. If a primitive appears in 3+ units, extract it.

### 3.3 Enumeration procedure (run on a fresh codebase)

Walk the codebase along **five axes**, then **dedup** shared surfaces into their own units.

**Step A — Walk routes/pages.** List every route and sub-route. Each top-level screen and each of its sub-tabs/sub-views becomes a candidate unit.

**Step B — Walk the component tree.** Descend into each screen's components. Promote to a unit: each **per-domain card/form**; each **reused primitive** (lists, dialogs, drawers, wizards, steppers, segmented controls, progress bars, summary widgets, voice/AI pipelines). A primitive reused ≥3× is extracted to its own unit.

**Step C — Walk services/stores/hooks.** For each service / store / query-hook: a service with non-trivial computation that no single screen owns becomes a unit (e.g. an analytics engine); the central preferences store becomes a unit; otherwise the service is *listed under* the screen unit it backs (appearing in that unit's "Files covered" + "Data model touched").

**Step D — Walk the DB/data schema.** Enumerate every table/interface in the client DB and every server-mirror table. The full canonical data model + every enum/status/preset/default/range becomes **one dedicated unit**. This is the spec every other unit's "Data model touched" section must agree with.

**Step E — Add cross-cutting systems explicitly.** These rarely have a single screen, so A–B miss them. Always add units for at minimum: **auth**; **navigation chrome** (header, nav, FAB, footer); **global dialogs & feedback** (toasts, welcome/about, bug-report, update banner, error boundary); **sync** (if any); **data model & enums** (from Step D); **settings store & enums**; **notifications**; **backup/restore & migration**; **theming** (token system); and any app-specific subsystems.

**Step F — Add an overview (00) unit.** One cross-cutting frame doc that maps everything (Phase 2).

**Dedup pass.** Before finalizing: any behavior that would be documented identically in 2+ units gets pulled into a shared unit, and the screen units reference it.

> **Deriving the unit/agent count when there is NO existing screen inventory.** A fresh codebase (e.g. Camp 404's `design/` has zero `.pen` files) often gives you only a **routes-to-capture list** — the briefing enumerates 17 routes, nothing else. **Route count is a FLOOR, not the unit count.** Steps B–E reliably inflate it: reused primitives, the central store, the canonical data-model+enums unit, and every screenless cross-cutting system (auth, nav chrome, push, sync, dialogs, theming) are all units that no route list mentions. Do not under-decompose by spawning only one agent per route — walk all five axes first, then `agent count = number of units + 1`.

### 3.4 Writing the unit index

Number units by **domain grouping, NOT alphabetically**, so the index reads as an architecture map: input surfaces → shared display patterns → each feature domain → settings groups → cross-cutting systems. The real run's order:
- `01–06` per-domain input cards
- `07–11` shared display patterns (text summary, recent-entries-edit, history drawer, card-shell/theming, voice entry)
- `12–20` a feature domain decomposed (meds: schedule, add-wizard, compound-library, prescriptions, titrations, dose-logging, inventory, edit, settings/tz)
- `21–26` another domain (analytics: summary, correlations, records, titration-tab, controls/export, engine)
- `27–33` settings pages + profile (6 settings units `27–32` collapsing a ~10-group accordion, plus `33` profile)
- `34–46` cross-cutting systems (auth, help manual, nav chrome, global dialogs, sync, data-model+enums, store enums, push, backup/migration, daily notes, debug, embedded server, substances)

Expect a **different count and different groupings** for your app. The output of Phase 0 is the manifest; the agent count is `number of units + 1` (the overview).

---

## 4. Phase 1 — Per-Unit Mapping Fan-Out

### 4.1 Fan-out shape & hard rules

- **N+1 agents, all in parallel:** one per unit, plus one for the overview.
- **One unit per agent — non-negotiable.** (1) *Faithfulness:* an agent given exactly one surface and told "be exhaustive about *this*" reads every line and copies real numbers; an agent told to do three screens skims. (2) *Bounded context:* one unit ≈ a handful of files, which fits comfortably with room to read deeply and cite precisely.
- **Parallel, not sequential.** Units are independent (each owns its own output file), so there is no ordering constraint. The only synchronization point is assembly (Phase 3).
- **File-as-sole-deliverable** (see §9 for why this is the #1 lesson). The agent's deliverable is the file it writes, **not** a structured return.
- **Source-grounded + digit-exact** (the four discipline rules in §4.4).

### 4.2 The 7-section per-unit template

Every unit doc opens with a **header block**, then the **7 canonical H2 sections in fixed order**.

**Header block (before section 1):**
- `# NN — <Unit Name>`
- `**Files covered:**` — a bulleted list of **every** source file the unit touches, each with a one-line role gloss that calls out non-obvious facts (which component is *not* imported, which path is dead, which file is the mirror). Cite absolute paths with line ranges when precision matters.
- `**Purpose:**` — 2–4 sentences stating what the surface does and the one non-obvious invariant that defines it.

**The 7 sections:**

| # | Section | Must contain |
|---|---|---|
| 1 | `## Features` | Every capability the surface exposes, **grouped by sub-component file** via `### <sub-component> (file.tsx)` sub-headings *(client-component units)* **or by endpoint/handler** *(server-action units — see variations below)*. One bullet per user-visible or system-visible capability; bold the feature name; copy strings in quotes; numbers inline; **formulas verbatim**. |
| 2 | `## User actions & interactions` | Every distinct interaction (tap, type, toggle, swipe, long-press, drag, keyboard activation, wizard Next/Back, export, sync trigger, dialog confirm/cancel) and its result — naming trigger + consequence (state change, write, toast, navigation) + disable conditions. Grouped bullets **or** an Action → Result table, both valid. |
| 3 | `## States & presentations` | Every visual/behavioral state — not just the happy path. Cover the global-states matrix from the overview §4 *as it applies here* plus unit-specific states. Each names the **trigger predicate** + **required grammar** (what the UI shows). Server-backed units add route states (e.g. `429`, `400`, `422`, `502`). |
| 4 | `## Enums, options & configurable values` | **The most digit-exact section.** Every enum member, option label + multiplier/factor, preset (full numbers), default + its sanitize range, unit convention, source-string convention, and input bound (min/max/step/inputMode) — **every member, no "etc.", no approximation.** Must capture **drift between the type and reality** (dead enum values, stale type comments). |
| 5 | `## Data model touched` | Every table/interface/type the unit reads or writes, with its **full field list**, and **which service writes which fields under which path**. Name aggregation read functions, the composable-group input shape, indexes, and any mirror/sync side-effect. |
| 6 | `## Validation, edge cases & business rules` | Every validation rule (with the failing-rule message), every edge case, every business invariant — each as condition + consequence, often with the literal predicate. Where the subtle "why" lives: rounding rules, day-cutoff semantics, async stale-guards, auth-gating, optimistic/offline behavior. |
| 7 | `## Sub-components / variants` | The component inventory — each sub-component/variant by exported name, one line on its role, and **explicit flags for dead/orphaned variants**. The catalog a redesigner re-skins. |

**Template variations by unit kind** (the 7 sections are fixed; content adapts):
- **Input/display cards (client components):** all 7 full; Features grouped by component file; heavy on presets/ranges.
- **Wizard units:** Features describe the step machine (dynamic step filtering, per-step validation, progress bar); Actions grouped by step; Data model lists the atomic multi-record save.
- **Server-action / route-handler units (server-only surfaces):** there may be no React component tree to walk. Re-bind the sections: **Features = the endpoints/mutations the surface exposes** (each `POST`/`PUT`/server action, grouped by route or handler file via `### <route or action> (file.ts)`); **User actions = the requests/inputs a caller can send** + the authorization/role gate on each; **States = the response/result states** (success payload, `400/401/403/422/429/5xx`, role-rejected, pending-approval); **Sub-components = the handlers/validators/schemas** the surface is built from (Zod schemas, server actions, middleware). The other three sections (Enums, Data model, Validation) are unchanged.
- **Data-model/engine units:** "User actions" → "the mutations the model must support"; "States" → "state the model must let the UI express"; Enums → the exhaustive canonical catalog.
- **Cross-cutting units:** same skeleton; Features/States describe system behavior rather than a single screen.

### 4.3 What good looks like — the SHAPE of a gold-standard excerpt

The portable lesson is the **shape** of each excerpt, not its domain content. Three short, real, digit-exact excerpts below — each prefixed with the **general pattern it demonstrates** — set the bar. (The full intake-tracker worked examples, ~1.5 pages of water/coffee/alcohol/sodium specifics, live in the §12 Reference-artifacts appendix; read `01-liquids-water-input.md` and `02-food-salt-ai-input.md` for the complete set. Do not transcribe their numbers into your own app — extract the pattern.)

> **PATTERN — a header gloss flags a non-obvious fact about a file (e.g. a component that is NOT imported).** Real (`01-liquids-water-input.md`):
> `- src/components/collapsible-time-input.tsx (shared "Set different time" collapsible — used by other cards, e.g. weight/BP; the manual dialog here re-implements the same disclosure pattern inline rather than importing this component)`

> **PATTERN — a formula is copied verbatim, including its inconsistent rounding quirk (the example happens to be alcohol units).** Real (`01-liquids-water-input.md`):
> **Alcohol:** standard drinks `= ethanolGrams / 10`, where `ethanolGrams = volumeMl × (abv/100) × 0.789`. ABV % is the stored input; standard drinks are derived. The live display and the create path round to **1 dp** (`toFixed(1)`); the **edit-form sync path rounds to 2 dp**…

> **PATTERN — an enum carries its per-member factor, every member, no "etc." (the example happens to be a sodium-source enum).** Real (`02`/`01` sodium multipliers):
> **Sodium measurement source (`SodiumSource` / `SodiumKind`)** — options & multipliers (`SODIUM_MULTIPLIERS`): `sodium` → ×1.0 (label "Sodium") · `salt` → ×0.39 (table salt ≈ 39% sodium, label "Salt") · `msg` → ×0.12 (MSG ≈ 12% sodium, label "MSG").

The other shapes the worked examples demonstrate (and which your docs must hit) — see §12 for the verbatim intake-tracker instances:
- **Action → Result table** rows naming trigger + the exact toast title/description + disable predicate.
- **A single state broken into all its sub-cases**, each with its trigger predicate and required grammar.
- **A data interface listing per-path writes** (which tab/service writes which fields under which `source` string).
- **An invariant stated with its literal predicate** (e.g. cleared-field-on-edit = soft-delete; non-numeric junk = leave untouched).
- **A sub-component entry that names a dead/orphaned variant** explicitly (a component path that is never mounted).

### 4.4 Source-grounding discipline (bake into every agent)

1. **Read the actual source, never infer from names.** Open every entry file and follow its imports (services, hooks, constants, schema, store). A label, a default, a branch — read it.
2. **Cite `file:line` for load-bearing claims** (features, enum members, thresholds, validation rules).
3. **Copy literal numbers/enums/tokens digit-exact** — never rounded or paraphrased. Capture ugly truths (inconsistent rounding, dead branches, deprecated fields).
4. **Mark uncertainty as low-confidence** inline (`<!-- low-confidence: … -->`) — do not guess. Flagged uncertainty routes a human's eyes to the right spot; guesses look like facts.

### 4.5 COPY-PASTE per-unit agent prompt template

Fill the four placeholders from the manifest (`{UNIT_NAME}`, `{ENTRY_FILES}`, `{SIBLING_CONTEXT}`, `{OUTPUT_PATH}`).

```
You are documenting ONE load-bearing surface of this application for a totalistic
feature-set brief. The brief's job: capture EVERYTHING this surface does — every
feature, action, state, enum, data field, and validation rule — so an alternative
designer can restyle it freely while DROPPING NO FUNCTIONALITY. Be exhaustive about
THIS unit only; other agents cover the rest.

UNIT: {UNIT_NAME}
ENTRY FILES (start here, then follow their imports — services, hooks, constants,
schema, store, server actions, route handlers — as far as needed to document this surface):
{ENTRY_FILES}

SHARED CONTEXT (terminology, domain identity tokens/icons, shared primitives, the
global-states matrix you must account for — use this vocabulary, don't reinvent it):
{SIBLING_CONTEXT}

=== HOW TO WORK ===
1. READ the actual source of every entry file and every import that matters. Never
   infer behavior, labels, or values from a component/function name — open it and read.
2. CITE file:line for load-bearing claims (features, enums, thresholds, validation).
3. COPY literal values digit-exact: preset numbers, defaults, thresholds, every enum
   member, CSS/theme tokens, schema field names, and formulas — verbatim from source.
   Never round, summarize, or paraphrase a number or an enum. Capture ugly truths
   (inconsistent rounding, dead branches, deprecated fields) explicitly.
4. If you cannot confirm something, write it inline as
   `<!-- low-confidence: <what & why> -->` — do NOT guess a plausible answer.

=== OUTPUT FORMAT (exactly these sections, in this order) ===
# {UNIT_NAME}
**Files covered:** <bulleted list; each file + one-line role>
**Purpose:** <one paragraph: what this surface is and what it lets the user do>
## Features                  <!-- group by "### <sub-component> (file.tsx)" for UI units, or
                                  "### <route/action> (file.ts)" for server-action units -->
## User actions & interactions
## States & presentations    <!-- account for every state in the global-states matrix -->
## Enums, options & configurable values
## Data model touched        <!-- exact table/interface + field names from schema -->
## Validation, edge cases & business rules
## Sub-components / variants  <!-- for server-only units: the handlers/validators/schemas -->

=== DELIVERABLE (read carefully) ===
Your SOLE deliverable is the file you WRITE to this exact path:
    {OUTPUT_PATH}
WRITE the complete document there with your file-write tool. Do NOT return the
document contents in your reply and do NOT use a structured-output return — both are
unreliable for long documents and will be ignored. After writing, reply with ONLY the
absolute path and a one-line status (e.g. `wrote {OUTPUT_PATH} — 7 H2 sections, N lines`).
If a section is genuinely incomplete, still write the file with that section marked
`<!-- INCOMPLETE: reason -->` rather than returning prose.
```

**Filling the placeholders (all from the manifest):**
- `{UNIT_NAME}` → e.g. `01 — Water / Liquids Input`
- `{ENTRY_FILES}` → the unit's bulleted file list
- `{SIBLING_CONTEXT}` → the overview agent's domain-identity table + shared-primitives list + global-states matrix (so units share vocabulary). For tightly-coupled units, also pass a one-line summary of adjacent units to prevent overlap/gaps at the seams.
- `{OUTPUT_PATH}` → the pre-computed absolute path, e.g. `design/feature-set/01-liquids-water-input.md`

**Orchestrator success check (filesystem-level):** file exists, is non-trivially long, contains the 7 required `## ` headers. A missing or stub file = re-dispatch that one agent (cheap, because units are independent).

> Tip: run the overview agent first and hand its output to unit agents as `{SIBLING_CONTEXT}` so units use consistent domain identity/terminology — or run fully concurrently and reconcile vocabulary at assembly.

### 4.6 Fan-out cost / time / token budget envelope

Sizing this for your own app needs an operational estimate, not just method correctness. The real run was **~95 agent invocations**: 47 mapping agents (Phase 1, parallel) + 47 verifier agents (Phase 4, parallel) + 1 consolidation agent. Use this to size yours:

- **Agent count = (U mapping) + (U verifying) + 1 consolidation**, where `U = units + 1 (overview)`. For a 17-route app that decomposes to ~30 units, expect ~`31 + 31 + 1 ≈ 63` invocations.
- **Per mapping/verifier agent:** a long-read → long-write task. Budget roughly one mid-size code-reading session each (read a handful of files end-to-end, emit a few hundred lines). Treat each as comparable to a focused "read these files and write a report" session for cost estimation in your own pricing.
- **Parallelism ceiling matters.** The two big fan-outs are embarrassingly parallel (units are independent), but your orchestrator/harness has a max concurrent-subagent limit. If it can run K at once, wall-clock ≈ `ceil(U/K) × per-agent-time` for each fan-out phase, plus one serial consolidation. Confirm your harness can sustain K before committing — if not, run the fan-out in batches.
- **Consolidation is serial and read-heavy** (it ingests all U verifier reports). Size it for a long read, short write.
- **Re-dispatch is cheap** because units are independent: a failed/stub unit costs one agent, not a re-run of the batch.

---

## 5. Phase 2 — The Overview / Cross-Cutting Frame (`00-overview.md`)

The overview is its **own agent**, so the cross-cutting frame is itself source-grounded (it cites real theme tokens, the route table, enum sources). It has a header (Status / Audience / Companion / Read-order note) then **7 sections**.

**§1 — What the app is, and its job (+ design north-star).** 2–3 paragraphs: what the product *is* (platform, user, modality), what it is **not** (explicit anti-scope, to kill misguided "engagement" patterns), and the operating principles. Then a `### Design north-star` sub-section: one quotable sentence the whole design is tested against. Real:
> "Every screen should let the user answer 'am I on track, and is everything safe?' in under three seconds, log the next entry in under two taps, and never feel judged for the answer."

Followed by the principles that flow from it (real: *information not verdicts*; *local is truth, network is detail*; *color is one of four redundant channels*).

**§2 — Every first-class entity needs a stable identity (KEY CONCEPT).**

**General rule (applies to every app):** enumerate every first-class entity the product organizes around; give each a stable **identity triple** `{ identity token, icon, short label }`; **name the single source-of-truth token file**; and **flag any token collisions** so colliding entities are disambiguated by icon+label, not by the colliding channel alone. The load-bearing invariant: **an identity token answers "which thing is this?" and must NEVER encode a value/status** — a separate status scale answers "how am I doing?".

**Subcase — per-entity (per-domain) hue table.** *Applies only if the app uses per-entity theming (each entity gets its own color). Skip entirely for single-palette apps (e.g. Camp 404 — see §11/P2 — which has one global brand palette; there the "identity table" is just that one palette plus the organizational entities, and you do NOT manufacture a per-entity hue table.)* When per-entity theming applies, render the triple as a table: `Domain | Theme key | Icon | Identity hue | Kind`, sourced from one tokens file, e.g. `Water | water | Droplets | sky→cyan (200°) | Budget`. Call out **hue collisions** explicitly (real: "weight↔medication exactly 8° apart … distinguish colliding domains by icon + label, not hue").

**§3 — Shared component patterns.** A bulleted catalog of the structural primitives every unit assumes and every redesign must keep (re-skinned but present): card-shell variants, tab inputs, quick-add chips+steppers, recent-list+inline-edit, modal editors, segmented controls, wizards, drawers/sheets, accordions, nav chrome, summary widget, voice/AI pipeline, global feedback layer. Each bullet names the primitive + its non-negotiable behavior + which units use it.

**§4 — Global states matrix: DERIVE it from your architecture.** Do **not** copy a fixed row set. Classify the rows your app actually needs:
- **(a) Always-needed rows** (every app): Empty, Loading, Populated, Validation error, Submitting/pending, Success, Disabled/gated, Dark mode (if themed).
- **(b) Sync-model rows** — *only if offline-first / local-first*: Offline, Syncing, Synced, Sync-failed, Conflict, Stale-data. **A server-only app drops all of these.**
- **(c) Budget rows** — *only if you have goal-accumulating metrics*: Over-target, Over-limit. Skip for apps with no budgets/goals.
- **(d) Auth/role rows** — *if role-gated or approval-gated*: pending-approval, rejected, invite-gated, onboarding-incomplete.

Render the chosen rows as a table: `State | What it means | Required grammar`, where "Required grammar" encodes the north-star (e.g. "Loading → shape-matched skeletons, not spinners"; "Offline → never red/destructive"). The intake-tracker row set (Empty/Loading/Populated/Validation/Submitting/Over-target/Over-limit/Success/Offline/Syncing/Synced/Sync-failed/Conflict/Stale/Disabled/Dark) is **one instantiation** — categories (a)+(b)+(c) — not the template. Each unit's §3 specializes whichever rows apply. *(See §11/P9 for the Camp 404 derivation: drops (b) and (c), adds (d).)*

**§5 — Information architecture (routes → unit mapping).** A table mapping every route/sub-surface to the unit numbers that document it (`Route | Screen | Maps to units`), in nav order, plus a paragraph listing the cross-cutting/non-screen units. This is the navigability index from URLs to docs — and it lets a downstream consumer pull only the units for the screen it's working on.

**§6 — Index of the N unit docs.** A numbered list of all units, title-only, in the domain-grouped order (NOT alphabetical) so the index reads as an architecture outline.

**§7 — Guidance for an alternative-design generator: the "DROP NO FUNCTIONALITY" contract (KEY CONCEPT).** The load-bearing section, in two explicit halves:

- **"You may freely change:"** layout/grid, color/theming, hierarchy, typography, iconography, motion, navigation metaphor, the *style* of inputs (as long as the input *kind* survives — "a tap-scale may be re-skinned but not turned into a dropdown"), card shapes, chart styling, mood.
- **"You must preserve — drop NO functionality:"** an enumerated list binding each preserved thing to a unit-doc section:
  1. **Every feature** in each unit's Features section.
  2. **Every action** in User actions.
  3. **Every state** in States *and* the §4 global matrix — "Design each one — do not ship only the happy path."
  4. **Every enum/option/value** in Enums — "The UI must be able to represent exactly these values — no more, no less."
  5. **Every validation rule and edge case.**
  6. App-wide structural invariants (real: "all tracked domains and the two card variants (Budget vs Reading) — never force a reading metric into a progress-toward-goal shape").
  7. The redundant-channel rule (color never sole carrier; keep icon+label; disambiguate identity-token collisions).
  8. The architecture invariant (real: local-first — instant render, optimistic writes, one ambient sync signal, non-blocking conflict review).

Close with a conflict-resolution rule: *"the unit doc wins on what must exist; the companion brief wins on tone; you win on how it looks."* Generically: the overview defines the **spirit**, the unit docs define the **functional contract**, and §7 is the explicit promise that a redesign reimagines the surface without removing capability.

---

## 6. Phase 3 — Assemble the Master Brief

Assembly is **mechanical, not a model task** — the one purely deterministic phase. But **there is no assembler to port: no such script exists in the reference repo** (the master `design/design-feature-set.md` carries the prescribed banner but was assembled ad-hoc; a tree-wide grep for the concat/banner/sort logic returns nothing). **The new team must WRITE the assembler.** The full deterministic spec and a runnable script follow — copy-paste it as you would any other artifact in this playbook.

**Deterministic spec (what the assembler must do, every run):**
1. Glob `design/feature-set/*.md` (the unit files only — not the `verification/` subdir).
2. **Sort by numeric filename prefix** ascending → `00-overview.md`, then `01..NN`. (Zero-padded prefixes make lexical sort == numeric sort.)
3. Prepend a fixed **banner** + a short **master header** (title, date, status, purpose, the "treat every feature/action/state/enum as a requirement to preserve" how-to note, pointer to the granular sources + verification report).
4. **Concatenate the files verbatim** (byte-for-byte; no model in the loop) with a fixed **separator** between docs: `\n\n---\n\n`.
5. Write to `design/design-feature-set.md`, **overwriting** on every run.

Properties: **idempotent + regenerable** — it reads the unit files and rewrites the master from scratch each time, so re-running after fixing one unit is safe and cheap. **Never hand-edit the master** (edit the unit, re-assemble).

**Runnable assembler (Node, ~15 lines — write this to `scripts/assemble-feature-set.mjs` and run `node scripts/assemble-feature-set.mjs`):**

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "design/feature-set";
const OUT = "design/design-feature-set.md";
const SEP = "\n\n---\n\n";
const BANNER = "<!-- AUTO-ASSEMBLED from design/feature-set/*.md. Regenerate by re-running scripts/assemble-feature-set.mjs. -->";

const files = readdirSync(DIR)
  .filter((f) => /^\d+.*\.md$/.test(f))          // unit files only (NN-*.md); ignores verification/ subdir
  .sort((a, b) => parseInt(a) - parseInt(b));     // numeric prefix order: 00, 01, … NN

const header = [
  BANNER,
  "",
  "# Application — Totalistic Design Feature-Set Brief",
  "",
  `**Assembled:** ${new Date().toISOString().slice(0, 10)}  ·  **Status:** generated build artifact (do not hand-edit)`,
  "",
  "**How to read:** treat every feature / action / state / enum / value below as a requirement to PRESERVE in any redesign (drop no functionality). Edit the per-unit sources in design/feature-set/, then re-run the assembler. See design/feature-set-verification-report.md for the adversarial accuracy audit.",
].join("\n");

const body = files.map((f) => readFileSync(join(DIR, f), "utf8").trimEnd()).join(SEP);
writeFileSync(OUT, header + SEP + body + "\n");
console.log(`assembled ${files.length} unit files → ${OUT}`);
```

*(Bash equivalent if you prefer no Node: `{ printf '%s\n\n# App — Feature-Set Brief\n' "$BANNER"; for f in $(ls design/feature-set/[0-9]*.md | sort); do printf '\n\n---\n\n'; cat "$f"; done; } > design/design-feature-set.md` — same banner, same `\n\n---\n\n` separator, same numeric sort.)*

**Size caveats:**
- The assembled master is large (real one ~10,610 lines / 47 sections) — it **exceeds a single safe read budget**. Treat the per-unit files as the editing surface and the master as a build artifact.
- When a downstream consumer (a designer agent) needs the brief, hand it the **overview + the one-or-two relevant unit files**, not the whole master. The IA route→unit map exists precisely so a consumer can pull only what it needs.
- If your file-read tool caps at ~2,000 lines, the master needs ranged/paged reads; unit files read in one shot. Another reason the unit is the working unit.

---

## 7. Phase 4 — Adversarial Verification (Work Backward)

A backward pass that works *from the docs to the source*: every claim in every doc is treated as a hypothesis to **refute** against real code. One verifier agent per unit doc, fanned out in parallel; **each agent's `.md` file is its sole deliverable** (no structured return — agents drop those after a long read). It produces per-unit verdicts, a consolidated master report, a tiered fix list, and a harvest of real source bugs/dead code.

### 7.1 The per-unit verifier — what it does and records

For ONE doc, it opens the real source for every file the doc names (and the code that file pulls in), walks **every claim** (features, actions, states, enums, configurable values, data fields, validation rules, sub-components), and tries to **disprove each against the code**. A claim is "verified" **only** when the source actively confirms it; if the source cannot confirm it, or the verifier can't locate the backing code, the claim is **flagged, not given the benefit of the doubt**.

Two ledgers:
- **Inaccuracies** — doc says X, code does Y. Columns: `severity | doc claim | code reality | file:line`.
  - **high** — a factual error a designer would build on and get wrong: a fabricated feature/requirement, a misnamed model/value, a feature wired to the wrong subsystem.
  - **medium** — a real divergence that misleads but is locally contained: wrong count, a state/control described as reachable that never renders, behavior attributed to the wrong code path.
  - **low** — wording nuance, conflated title/description strings, imprecise-but-not-wrong scoping, a decimal-rounding edge case.
- **Omissions** — real behavior/state/enum/validation/sub-component the doc missed. Columns: `severity | missing behavior/state/enum | file:line`. (In practice omissions skew low/medium; a high omission would be an entire load-bearing surface left undocumented.)

Two supporting sections make the audit trustworthy:
- **Spot-confirmed** — a dense bullet list of claims checked digit-for-digit and found correct (presets, thresholds, enum members, source strings, `file:line`). This is the evidence that the "verified" count is real.
- **Low-confidence / could-not-verify** — claims that are design questions, depend on upstream package internals, span subsystems outside this unit's file set, or need git-history tracing. Fenced off, not silently passed/failed.

**The adversarial failure modes to hunt** (each stated generally, with the intake-tracker instance in parentheses — keep the hunt usable on any data layer):
- **Fabricated features/requirements** that exist nowhere in source — grep to prove absence (intake-tracker: a fabricated "Bristol scale" defecation requirement, `grep -ri bristol` = zero hits).
- **Dead/orphaned code presented as live** — tokens defined-but-never-read, settings written-but-never-read, routes/functions with zero app callers, controls gated on a prop no real consumer passes (intake-tracker: dead `dataRetentionDays`, the `outlineText` theme token read nowhere).
- **Unreachable states from a live-data hook seeding a non-undefined default** — a live-data subscription that seeds a truthy/non-undefined initial value makes loading/skeleton/empty branches dead code (intake-tracker: `useLiveQuery` defaults — but the pattern applies to any live-query/subscription/SWR-with-initialData hook on any data layer).
- **Wrong subsystem attribution** — a behavior credited to code path A that actually lives in path B (intake-tracker: substance-enrich misattributed to voice/"Other" flows when its only caller is a background runner).
- **Deprecated/legacy field displayed instead of the authoritative one** (intake-tracker: a deprecated `time` field shown where the timezone-aware `scheduleTimeUTC` should be).
- **Off-by-one / wrong counts** — table lists, registries, manual counts, preset arrays (intake-tracker: a stale "17 tables" comment when there are 18; a backup-import toast summing 16 of 18 counters).
- **Conflated UI strings** — title vs description, single-vs-two-toast, single-vs-multi-decimal rounding.
- **Test-only / UI-unreachable features described as user-facing** (intake-tracker: encrypted-backup PIN path + migration integrity-verify reachable only by tests).

**Scoring:**
- Header line: `**Verdict:** <verdict>  ·  checked N claims, verified M.`
- **Accuracy % = M / N**, per unit and summed across units for the master headline.
- **Verdict scale:**
  - **accurate** — high verified %, no high-severity inaccuracy, gaps cosmetic.
  - **minor-gaps** — a handful of medium inaccuracies/omissions; nothing that breaks a rebuild.
  - **significant-gaps** — a high-severity error, or enough mediums that the doc would actively mislead. (Real run: **zero** units hit this — that's the bar.)
- **Severity dominates the count** — verdict is a judgement, **not** a pure %-cutoff. Worked example from the real run: **unit 21 (analytics-summary) scored 113/118 ≈ 95.8% and was rated `accurate`** (its 5 inaccuracies were all low-severity), while **unit 45 (mcp-server) scored 117/120 ≈ 97.5% — a HIGHER raw % — yet was rated `minor-gaps`** because it carried medium-severity divergences. The higher-percentage doc got the worse verdict. Apply the verdict by worst-severity-present, then break ties on %.

### 7.2 COPY-PASTE adversarial verifier agent prompt template

```
You are an adversarial source-of-truth verifier. Your job is to REFUTE, not rubber-stamp.

INPUTS
- Unit doc to verify:   {UNIT_DOC_PATH}
- Source roots to read: {SOURCE_ROOTS}
- Write your report to: {OUTPUT_PATH}   ← this FILE is your only deliverable. Do not return a structured object; write the file and stop.

MINDSET (read twice)
- Treat every sentence in the doc as a claim you must DISPROVE against real code.
- A claim is "verified" ONLY when you have opened the source and the code actively confirms it.
- DEFAULT TO FLAGGING. If you cannot locate the backing code, or the source is ambiguous, or the
  behavior is only reachable in a branch that never executes — that is an Inaccuracy or a
  Low-confidence item, NOT a pass. Never extend the benefit of the doubt.
- Be digit-exact. Copy real numbers, enum members, token strings, schema fields, and source
  strings verbatim. Never approximate, round, or infer a value you did not read.
- Cite file:line for EVERY finding and every spot-confirmation.

PROCEDURE
1. Read {UNIT_DOC_PATH} in full. Enumerate its claims across all sections (Features, User actions,
   States & presentations, Enums/options/configurable values, Data model, Validation/edge cases/rules,
   Sub-components/variants).
2. For EACH file named under the doc's "Files covered" (and the code those files import/call), read the
   real source in {SOURCE_ROOTS}. Do not stop at the first matching line — read enough to confirm the
   claim is reachable in production, not dead/orphaned/test-only code.
3. Actively hunt these adversarial failure modes:
   - Fabricated features/requirements that exist nowhere in source (grep to prove absence).
   - Dead/orphaned code presented as live: tokens defined-but-never-read, settings written-but-never-read,
     routes/functions with zero app callers, controls gated on a prop no real consumer passes.
   - Unreachable states: loading/skeleton/spinner/empty branches that never render because a live-data
     hook/subscription seeds a truthy/non-undefined default (live-query, SWR initialData, etc.).
   - Wrong subsystem attribution: a behavior credited to code path A that actually lives in path B.
   - Deprecated/legacy field displayed instead of the authoritative one.
   - Off-by-one or wrong counts (table lists, registries, manual counts, preset arrays).
   - Conflated UI strings (title vs description), single-vs-two-toast, single-vs-multi-decimal rounding.
   - Test-only / UI-unreachable features (encrypted path, verify step) described as user-facing.

OUTPUT FILE FORMAT (write to {OUTPUT_PATH})
  # Verification — <unit-id-and-name>

  **Verdict:** <accurate | minor-gaps | significant-gaps>  ·  checked <N> claims, verified <M>.

  <1–3 sentence summary: overall reliability + where the defects cluster.>

  ## Inaccuracies
  | severity | doc claim | code reality | file:line |
  |---|---|---|---|
  | high|medium|low | "<verbatim doc claim>" | <what the code actually does> | <path:line> |

  ## Omissions
  | severity | missing behavior/state/enum | file:line |
  |---|---|---|
  | medium|low | <real behavior/state/enum the doc never mentions> | <path:line> |

  ## Spot-confirmed
  - <dense bullets of claims checked digit-for-digit and found correct, each with (file:line)>

  ## Low-confidence / could-not-verify
  - <design questions, upstream-package internals, cross-subsystem trust, git-history-dependent claims>

SCORING RULES
- "checked N" = total distinct claims you evaluated. "verified M" = those the source actively confirmed.
- Accuracy % = M / N. Put the raw counts in the header line.
- Verdict (SEVERITY DOMINATES — not a raw %-cutoff):
    accurate         = no high-severity inaccuracy; remaining gaps cosmetic/low.
    minor-gaps       = a few medium inaccuracies/omissions; nothing that breaks a rebuild.
    significant-gaps = any high-severity error, OR enough mediums that the doc would actively mislead.
  A unit with several lows but zero highs/mediums is "accurate" even if its raw % is lower than a
  minor-gaps unit's (real run: a 95.8% unit was "accurate", a 97.5% unit was "minor-gaps").

Tag anything you could not check against code as Low-confidence — never silently pass it.
```

### 7.3 The consolidated master-report template

One consolidation agent ingests all per-unit reports and aggregates **only what those files contain** (no fresh claims). Bracketed numbers below are the **real run's headline as an illustrative bar**: 47 units, 4,220 claims, 4,002 verified = **94.8%**, **0 significant-gaps**, **3 HIGH**.

```
# Feature-Set Verification — Master Report

Consolidated from <U> per-unit adversarial verification reports. Each per-unit report checked one
doc against real source, recording Inaccuracies (doc claim vs code reality, severity + file:line)
and Omissions (real behavior/state/enum the doc missed). This report aggregates only those files.

## 1. Executive Summary
| Metric | Value |
|---|---|
| Units verified           | <U>          (e.g. 47) |
| Total claims checked      | <N>          (e.g. 4,220) |
| Total claims verified     | <M>          (e.g. 4,002) |
| Overall verified % (accuracy) | <M/N>    (e.g. 94.8%) |
| Total inaccuracies        | <I>          (e.g. 182) |
| Total omissions           | <O>          (e.g. 309) |
| Total findings            | <I+O>        (e.g. 491) |

Inaccuracies by severity: <h> high · <m> med · <l> low.   (e.g. 3 · 34 · 145)
Omissions by severity:    <h> high · <m> med · <l> low.   (e.g. 0 · 8 · 301)
Per-unit verdicts: <a> accurate · <mg> minor-gaps · <sg> significant-gaps.  (e.g. 19 · 28 · 0)
Per-unit claim counts ranged <min>–<max> (e.g. 41–121); most units in the ~78–118 band.

Overall verdict: <1 paragraph — reliability, then name the 2–4 REPEATING defect PATTERNS that
matter for a rebuild (e.g. dead features presented as live; unreachable live-data states;
deprecated field displayed). State how many HIGH items and whether any unit is significant-gaps.>

## 2. Per-Unit Verdict Table (worst-first)
Sorted significant-gaps → most inaccuracies → most omissions.
| Unit | Verdict | Claims | Verified | #Inacc | #Omis |
|---|---|---:|---:|---:|---:|
| <unit> | significant-gaps/minor-gaps/accurate | N | M | I | O |
| … (one row per unit, worst at top) |

## 3. All HIGH-Severity Findings
List EVERY high-severity item individually (inaccuracies and omissions), each as:
### H-n · Unit <id> (<name>) — <one-line headline>
- Doc claim:   <verbatim>
- Code reality:<what the code does, with proof e.g. grep returns zero hits>
- file:line:   <paths>

## 4. All MEDIUM-Severity Findings (grouped by unit)
### Unit <id> — <name>
- Inacc: <doc claim> → <code reality> → file:line
- Omis:  <missing behavior> → file:line
(Repeat per unit that has any medium finding. Units with only lows say "All findings low; see §5".)

## 5. Prioritized FIX LIST (highest-impact first)
Tag each item [Quick] (one-line string/number/label fix) or [Re-check] (needs a fresh code read or
a design decision — e.g. whether to document a dead feature or have eng remove it).
### Tier A — Factual errors that mislead (do first)
  — wrong model name, fabricated requirement, wrong-subsystem attribution, wrong counts.
### Tier B — Dead / orphaned features presented as live (collapse duplicates; flag to eng)
  — write-only settings, never-read tokens, controls gated on a prop no consumer passes.
### Tier C — Unreachable states from live-data truthy defaults
  — loading/skeleton/spinner branches that never render; empty state shows during load instead.
### Tier D — Deprecated field displayed instead of authoritative one
  — e.g. a deprecated raw field shown where the timezone-aware/derived value should be.
### Tier E — Low-risk nuances (numerous)
  — toast title-vs-description, single-vs-two-toast, decimal rounding, label/count tweaks.

## 6. Code Bugs / Dead Code Surfaced (route to engineering — SOURCE problems, not doc problems)
Numbered list of REAL source defects the audit exposed (NOT doc fixes):
  — latent bugs (e.g. a toast/summary that under-counts because it sums a subset of fields),
  — fully dead settings/tokens/functions (zero consumers),
  — dormant flows (verify/encrypt paths reachable only by tests),
  — unreachable UI states, inert DB columns, and stale source comments that mislead future editors.
Each with file:line and the unit(s) that surfaced it.

## 7. Low-Confidence / Needs-Human-Eyes
Aggregate every per-unit Low-confidence item: design questions, by-construction-vs-active PII
stripping, upstream-package runtime guarantees, cross-subsystem sync round-trips, hedged counts,
billing/wall-clock claims from comments. These need a human or product call, not a code fix.

## 8. Overall Certification Verdict
A single explicit line the acceptance loop (§8/§10) keys off:
  CERTIFICATION: <CERTIFIED RELIABLE | NOT YET — re-run after fixes>
  — Brief is certified reliable for an alternative-design rebuild under the "drop no functionality"
    contract IFF: overall accuracy ≥ ~95%, 0 units significant-gaps, every HIGH finding fixed,
    all §6 code bugs filed, all §7 low-confidence items triaged.
  State which of those five conditions hold and which (if any) block certification.
```

---

## 8. Phase 5 — Apply Fixes & Harvest Source Bugs

The backward pass has **two outputs, applied in two directions.**

**A. Fixes applied back to the docs** (driven by §5 FIX LIST, in tier order):
- **Tier A** factual errors first — they actively mislead a rebuild (rename the model, delete the fabricated requirement, re-attribute the flow, correct the count).
- **Tier B** stop describing dead/orphaned features as functional — drop them from the doc's "live" surface or annotate "not-wired"; collapse duplicate descriptions across units.
- **Tier C** remove or re-label unreachable loading/skeleton states; document that the empty state renders during initial load instead.
- **Tier D** note the deprecated-field divergence (or flag the inconsistency to eng).
- **Tier E** sweep low-risk string/label/rounding/toast nuances.
- `[Quick]` items are one-line edits; `[Re-check]` items require a fresh code read or a product decision (notably: *should the doc describe a dead feature at all, or should engineering remove it?*).

**B. Source harvest — the pass doubles as a code audit** (driven by §6). Because every claim was chased into real code, verifiers surfaced genuine **source** defects unrelated to documentation, filed to engineering rather than patched in the docs. The portable, app-agnostic categories: **dead settings/tokens with zero consumers; dormant test-only flows; under-counting aggregations; latent bugs; inert DB columns; stale comments that mislead future editors.** (The concrete intake-tracker instances — a backup toast summing 16/18 counters, dead `dataRetentionDays`, the dead `outlineText` token, dormant verify/encrypt paths, the stale "17 tables" comment — are listed in the §12 Reference-artifacts appendix as worked examples; a fresh team harvests its own.) The valuable byproduct: the backward audit **improved the source** — these bugs got fixed and the dead code removed.

**Acceptance bar (loop exits when all hold):**
- Overall accuracy ≥ ~95% (verified/checked across all units). Illustrative run hit 94.8% — at/just under the bar, with the residual being low-severity nuance.
- 0 units rated *significant-gaps*.
- Every HIGH-severity finding fixed in the docs (the run had exactly 3, all simple factual corrections).
- All code bugs / dead code filed to engineering (§6) — and, ideally, fixed/removed so the next pass finds them gone.
- Low-confidence items (§7) explicitly triaged to a human/product owner.

A second verification pass after fixes should show the HIGH list empty, the medium count down, and accuracy ≥ 95% — at which point the master report's **§8 Overall Certification Verdict** reads `CERTIFIED RELIABLE` and the brief is good for an alternative-design rebuild under the load-bearing contract.

---

## 9. Orchestration Lessons (Hard-Won)

- **File-as-deliverable > structured return** for long per-unit tasks. These are long-read → long-generation tasks, and after a long read agents **drop a structured return** — they truncate it, summarize instead of returning the full object, or reply with prose acknowledging the work instead of the work. The structured-return contract silently degrades exactly when the task is biggest. A file does not: it either exists with the content or it doesn't, and the orchestrator verifies it deterministically. Make the path the contract — pre-compute every output path in the manifest, the agent does not choose its filename, and its final message returns only the absolute path it wrote.
- **One unit per agent** keeps each pass small enough to stay exhaustive and faithful. An agent given one surface reads every line; an agent given three skims. Fan out in parallel since units are independent — single-unit re-dispatch is cheap.
- **Source-grounded + digit-exact:** cite `file:line`, copy real numbers/enums/tokens, and explicitly flag anything uncertain as low-confidence instead of guessing. Guesses look like facts; flagged uncertainty routes a human's eyes.
- **Overview is its own agent** so the cross-cutting frame is itself source-grounded, and supplies shared vocabulary to the units.
- **Write the assembler; assemble mechanically; edit the units:** the master is a regenerable build artifact (~10k+ lines) too large to hand-edit or read whole — but it is NOT a portable artifact, you write the ~15-line script yourself (§6).
- **Adversarial-refute stance in verification:** treat every doc sentence as a claim to disprove; default to flagging; never extend the benefit of the doubt. This is what catches dead-code-presented-as-live and unreachable states — and it improves the source, not just the docs.
- **Sequencing across methods is the orchestrator's job:** the companion port briefing does not know this method exists, so the orchestrator must run this first and inject the behavioral-coverage gate (§1, §11.3) — neither document self-links.

---

## 10. Acceptance Criteria / Quality Bar

A unit doc and the overall brief are "done" only when:

**Per-doc (forward pass):**
- Every load-bearing claim cites `file:line`.
- Every number, enum member, preset, token, and schema field is copied **digit-exact** from source (never rounded/inferred).
- All 7 H2 sections present; Features sub-grouped by source file (or by endpoint/handler for server-action units).
- Every drift between type and reality (dead enum values, stale comments, deprecated fields) is explicitly flagged.
- Unconfirmed claims marked `<!-- low-confidence: … -->`, not guessed.

**Whole-brief (backward pass):**
- **Verification accuracy ≥ ~95%** (verified/checked across all units).
- **0 units rated significant-gaps.**
- **Every HIGH-severity finding fixed** in the docs.
- **All code bugs / dead code filed to engineering** (§6), ideally fixed so the next pass finds them gone.
- **Low-confidence items triaged** to a human/product owner, not silently passed.
- **Master report §8 Overall Certification Verdict reads `CERTIFIED RELIABLE`.**

The real run met this bar at 4,220 claims / 94.8% verified / 0 significant-gaps / 3 HIGH (all fixed) — that is the target shape.

---

## 11. Camp 404 — Fill-in-the-Blanks Parameters + Pointer to the Port Briefing

Copy the **skeleton** (§§3–10); **regenerate** the **skin** from these blanks. The port briefing `docs/design/camp-404-design-system-port-briefing.md` (its **§9** in particular) **answers the infrastructure / IA / token blanks; the service-layer and schema blanks must be derived from code** (the briefing only documents the Pencil capture pipeline + routes + tokens — it does not enumerate Camp 404's service/store/hooks layer or schema location). Anytime a unit doc needs a Camp 404 path, token, route, or seed call that the briefing *does* enumerate, **cite the briefing's §9** (mapping table / screens / tokens / seed flows) — transcribe, do not re-derive. The analysis adds the *behavioral contract*; the briefing owns the *infrastructure mapping it covers*.

### 11.1 Parameter table

| # | Blank to fill | Pre-filled for Camp 404 (source) |
|---|---|---|
| **P1** | App one-liner + north-star (the question every screen must answer + tap/time budget). | Briefing §9 "Profile" gives the shape (role-gated camp-management PWA; tiers `camp_member`/`team_lead`/`captain`). **Write the north-star fresh** — Camp 404 has no health-tracking north-star; do NOT carry intake-tracker's over. |
| **P2** | Core entities + identity table `{token, icon, label}`; where tokens live; token collisions. | **Biggest delta:** briefing mapping table flags `src/lib/card-themes.ts → No equivalent`. Camp 404 is **one global brand palette, dark-only**. Use the single OKLCH palette from briefing §9 (`--color-primary: oklch(0.65 0.27 340)` etc.). Core entities are organizational (user/rank, invite, questionnaire, announcement, notification, family-tree referral), **not** color-coded metrics. **Single-palette app → do NOT manufacture a per-entity hue table** (see §5/§2 subcase). |
| **P3** | Routes/screens IA map (every route + sub-surface + unit mapping + role gating). | Briefing §9 "Screens/routes" enumerates all **17 routes** with real `apps/web/app/**/page.tsx` paths + tier-gating + dialog/overlay states (`report-bug-dialog`, `enable-push`, `acknowledgement-gate`, `feedback-gate`). **Use verbatim** as the IA section + unit-decomposition seed — but remember 17 routes is the FLOOR, not the unit count (§3.3). |
| **P4** | Component dirs + the primitive set every alternative must support. | Briefing §9: `packages/ui/src/components/` (avatar, button, card, checkbox, input, label, select, slider, textarea, dialog, popover, command, combobox) + camp-custom `control-panel`, `control-grid`, `quadrant-nav`. Screens under `apps/web/app/**`. |
| **P5** | Service/store/hooks layer locations. | **NOT in the briefing — the team must walk the codebase.** Camp 404 is **server-only**: state lives in Neon Postgres + the `globalThis` in-memory test store (`apps/web/lib/test-store.ts`). Walk `apps/web/lib/` for server actions / route handlers / lib helpers. **Do NOT assume a client service+hooks layer.** |
| **P6** | Data layer + schema location + parity constraint. | **NOT pre-filled by the briefing — the team must walk the codebase for the schema.** Briefing §9 tells you the *architecture* ("server-only Neon Postgres via Neon Auth/Better Auth, no IndexedDB/Dexie") but not the schema file. "Data model touched" reads Camp 404's actual Drizzle/Postgres schema, located by walking the repo, not a Dexie interface. |
| **P7** | External API/AI seams (mock for captures; appear as AI/voice/upload surfaces). | Briefing §9 "Endpoints to MOCK" — `api/voice/transcribe` (Groq Whisper), `lib/feedback-ai.ts` (Anthropic haiku), `api/uploads/avatar` (Vercel Blob), Firebase Admin push under `E2E_TEST_MODE`. |
| **P8** | Stack (framework/version, React, styling, package manager, monorepo, test runner, commands). | Briefing §9 "Profile" — Turborepo + pnpm-workspaces (pnpm 10.33.0, Node ≥22), Next.js 16.2.6 / React 19.2.6 / Tailwind v4 / `@camp404/ui`; dev `pnpm --filter @camp404/web dev`; e2e `pnpm --filter @camp404/web test:e2e` (serial, 1 worker). |
| **P9** | Global-states matrix (which cross-cutting states every screen designs for). | **Server-only + dark-only** → from the §5/§4 classifier, keep (a) always-needed rows, **drop (b) sync rows** (offline/syncing/synced/sync-failed/conflict/stale) and **drop (c) budget rows** (over-target/over-limit), and **add (d) role/approval/onboarding gating rows** (pending-approval, rejected, invite-gated, onboarding-incomplete) — first-class in Camp 404 (briefing §9 set-rank/set-approval/complete-onboarding seams). |
| **P10** | Companion brief + read order the overview defers to. | The opinionated brief is **the port briefing itself** plus `docs/design-system.md` / `docs/design-tooling.md` (briefing §9). The overview should *reference* those for tone, not restate them. |

### 11.2 Do-NOT-hard-copy hazards

Re-decompose Camp 404 from its 17 routes + dialog states — expect a **different count and different groupings**: likely auth/sign-in shells, invite-gate, the **13-page questionnaire wizard**, role-gated home/quadrant-nav, pending-approval, profile view/edit, notifications inbox, family-tree referral, tools, captain-only management/announcements, plus cross-cutting (auth, push, the `/api/test/*` seam, the `@camp404/ui` primitives, global dialogs). **Drop wholesale:** the intake-tracker 46-unit list, the per-entity hue table, IndexedDB/Dexie specifics, the medication data model, the offline-first/sync grammar, the budget-vs-reading card variants, and the seed-via-UI capture mechanism. Camp 404's "deep model" to document instead is **roles/ranks + invite/referral + the 13-page questionnaire**, and screens are seeded **exclusively through `/api/test/*`** (briefing §9 BLOCKER), not UI logging.

### 11.3 Composition guardrails

- **No re-derivation of Camp 404 facts the briefing covers** — cite the briefing's §9 for any path/token/route/seed call it enumerates; derive the service-layer and schema blanks (P5/P6) from code.
- **Run this analysis BEFORE the Pencil pipeline** — the feature-set docs are the acceptance criteria ("drop no functionality"). The briefing does NOT yet check behavioral coverage; you must ADD a new step that compares each generated `.pen` candidate against these unit docs (every feature/action/state/enum/validation survives the restyle).
- **Keep the two verification loops distinct** — briefing verification = "exported `.pen` matches its reference screenshot" (**visual fidelity, the only check the briefing performs**); this method's added verification = "doc matches the source code" + "`.pen` preserves the contract these docs define" (**functional fidelity**). Both needed; neither substitutes for the other; only the orchestrator sequences them (no cross-link exists in the briefing).

---

## 12. Reference Artifacts & Worked Examples (the model this playbook generalizes)

The full intake-tracker corpus is the worked example this playbook abstracts. The body above is domain-neutral; read these for digit-exact instances when you want to see the bar in concrete form. **Do not transcribe their numbers into your own app** — extract the pattern.

**Corpus facts (verified against the real artifacts):** exactly **46 numbered unit docs (`01–46`) + `00-overview.md` = 47 files**; verification ran **47 agents** producing 47 `verification/` reports; the assembled master is **10,610 lines**. The verification report: **4,220 claims checked, 4,002 verified = 94.8%, 182 inaccuracies (3 high / 34 med / 145 low), 309 omissions (0 high / 8 med / 301 low), 19 accurate / 28 minor-gaps / 0 significant-gaps**, per-unit claim counts **41–121**.

**Worked §4.3 gold-standard excerpts (full, digit-exact)** live in `01-liquids-water-input.md` and `02-food-salt-ai-input.md`: the 70/100/150/200 ml quick-set buttons; the two-toast "Record deleted"/"Entry deleted" delete pattern; `ethanolGrams = volumeMl × (abv/100) × 0.789` with its 1dp-vs-2dp rounding drift; the 500ms long-press preset-delete with click-suppression; the Log-Entry disable predicate; the two-stage progress sub-states; the recent-list-returns-null empty state; the `SODIUM_MULTIPLIERS` ×1.0/×0.39/×0.12 enum; the coffee preset catalog; the `saltLimit`/`sugarLimit`/`potassiumLimit`/`dayStartHour` defaults+ranges; the `IntakeRecord` field list with per-tab `source`-string writes; the cleared-substance-field soft-delete rule; and the dead `PresetTab` beverage-path flag.

**Worked §8 source-harvest instances (real defects the audit surfaced):** a backup-import toast that under-counts (sums 16 of 18 counters); dead `dataRetentionDays` + write-only weight-graph overlay booleans; the dead `outlineText` theme token (defined on all themes, read nowhere); dormant migration integrity-verify + encrypted-backup PIN flows (test-only); unreachable UI states from `useLiveQuery` truthy defaults; an inert DB column; the stale "17 tables" comment (there are 18). The 3 HIGH findings: Opus-vs-Sonnet model misname (unit 02), fabricated Bristol scale (unit 00), substance-enrich misattribution (unit 46).

**Files (repo-relative paths):**
- `design/feature-set/00-overview.md` — the 7-section overview frame
- `design/feature-set/01-liquids-water-input.md` (and `02`, `03`, `13`, `39`) — per-unit template across card / Reading-card / wizard / data-model variants; §4.3 worked excerpts
- `design/design-feature-set.md` — assembled master brief (10,610 lines; banner + header confirm assembly shape; note no assembler script exists — see §6)
- `design/feature-set/verification/01-liquids-water-input.md` (and `31`, plus `00…46`) — per-unit adversarial reports
- `design/feature-set-verification-report.md` — master verification report (47 units, 4,220 claims, 94.8% verified, 0 significant-gaps)
- `docs/design/camp-404-design-system-port-briefing.md` — the port briefing this composes with (§9 = the Camp 404 parameterization source; performs visual verification only)
