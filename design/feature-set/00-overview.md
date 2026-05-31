# 00 — Overview: The Totalistic Feature-Set Brief (for Alternative-Design Generation)

**Status:** Cross-cutting frame for the 46 per-unit feature-set docs in this folder.
**Audience:** An alternative-design generator (human or AI) producing *new* visual/interaction
takes on Intake Tracker, plus anyone needing a single map of the whole product.
**Companion:** `docs/design/2026-05-30-intake-tracker-design-brief.md` is the *opinionated*
brief (north-star, palette discipline, DO-NOT list). **This** doc is the *coverage map* —
what must exist, regardless of how it looks.

> **Read order.** Skim this overview, then the unit doc(s) for the screen you are designing.
> Each unit is the **functional contract** for its surface: every Feature, Action, State,
> Enum, and Validation rule it lists is load-bearing. An alternative may restyle freely but
> must **drop no functionality** (see §7).

---

## 1. What the app is, and its job

Intake Tracker is a **private, single-user, offline-first health log** — a PWA the owner uses
on a phone, one-handed, often offline, to manage real chronic conditions. It tracks fluids,
food/sodium, blood pressure, weight, bladder/bowel events, caffeine/alcohol, and medications
(schedule, titration, inventory), then surfaces analytics, voice/AI-assisted entry, optional
cloud sync, and an in-app help manual.

It is **not** a coaching app, a clinic, or a social/engagement product. There is no growth KPI,
so every "engagement" mechanism (streaks, guilt nudges, alarm-red shaming, badges, leaderboards)
is pure downside. The app's job is to be a **calm, trustworthy mirror the user can put down.**

### Design north-star

> **Every screen should let the user answer "am I on track, and is everything safe?" in under
> three seconds, log the next entry in under two taps, and never feel judged for the answer.**

Three operating principles flow from it: **information, not verdicts** (show `110% of target`,
not a red panic; red is reserved for genuine clinical danger only); **local is the truth, the
network is a detail** (render instantly off IndexedDB, never block on a spinner, communicate sync
through one quiet ambient signal); and **color is one of four redundant channels** (icon + label
+ shape/position + color), never the sole carrier of meaning.

---

## 2. Tracked domains (each has an identity color + Lucide icon)

Every tracked domain owns a **token triple `{ identity hue, Lucide icon, short label }`** from
`CARD_THEMES` (`src/lib/card-themes.ts`) that must travel together everywhere the domain appears
(card header, quick-add chip, chart series, recent-entry row, history row, quick-nav footer).
Identity color answers *"which metric is this?"* and must **never** encode a value; a separate
shared status scale answers *"how am I doing?"*.

| Domain | Theme key | Icon (Lucide) | Identity hue | Kind |
|---|---|---|---|---|
| Water / liquids | `water` | `Droplets` | sky→cyan (`200°`) | Budget |
| Sodium / salt | `salt` | `Sparkles` | amber→orange (`30°`) | Budget |
| Sugar (optional) | `sugar` | `Candy` | pink→rose | Budget |
| Potassium (optional) | `potassium` | `Banana` | purple→indigo | Budget |
| Caffeine | `caffeine` | `Coffee` | yellow→amber (`48°`, black fg) | Budget |
| Alcohol | `alcohol` | `Wine` | fuchsia→pink (`292°`) | Budget |
| Weight | `weight` | `Scale` | emerald→teal (`160°`) | Reading |
| Blood pressure | `bp` | `Heart` | rose→pink (`350°`) | Reading |
| Urination | `urination` | `Droplet` | violet→purple (`258°`) | Reading |
| Defecation | `defecation` | `CircleDot` | stone→amber (`33°`) | Reading |
| Eating (food chrome) | `eating` | `Utensils` | orange→amber (`25°`) | Reading-ish |
| Medications | (teal, `Pill`) | `Pill` | teal (`168°`) | Reading-like (pillbox) |

Eleven `CARD_THEMES` keys exist (`water · salt · sugar · potassium · weight · bp · eating ·
urination · defecation · caffeine · alcohol`); `eating` is the chrome of the combined Food card
that hosts the salt/sugar/potassium budget bars. Note: not all keys are backed by a `--<domain>`
HSL CSS-var token — only nine are (`water · salt · weight · bp · eating · urination · defecation ·
caffeine · alcohol`), plus `--medication`. `sugar` and `potassium` are **Tailwind-class-only** in
`CARD_THEMES` (gradient classes `from-pink-* to-rose-*` / `from-purple-* to-indigo-*`), so their
hues above are gradient descriptions, not single degree values like the var-backed domains. Several hues collide for color-vision-deficient
users (`weight↔medication` exactly 8° apart — 160° vs 168°; the three blues `water`/`urination`/`primary`; the warm cluster
`salt`/`eating`/`caffeine`) — alternatives **must distinguish colliding domains by icon + label,
not hue**, and must not grow the hue count.

---

## 3. Shared component patterns (every alternative must support these)

These are the structural primitives the unit docs assume. An alternative may re-skin or re-lay-out
each, but every one must remain present and functional.

- **CardShell, two variants.** One gradient-washed card anatomy (icon-chip + label header,
  right-side stat slot, body) split by *what the metric IS* (units 10, 01–06):
  - **Budget cards** — accumulate toward a daily target, can go over: water, sodium, sugar,
    potassium, caffeine, alcohol. Carry a progress fill (3 states: on-budget → extended →
    over-limit), `remaining`/`over by` readout, target/pace marker, quick-add chips.
  - **Reading cards** — events/logs with no daily goal: BP, weight, urination, defecation. Carry
    last value + small sparkline + today's count + quick-log. **No progress-toward-goal visual.**
- **Tab-based inputs.** The Liquids card splits Water / Beverage / Coffee / Alcohol into tabs;
  each tab owns its identity color, presets, and stepper (units 01, 46).
- **Quick-add chips + steppers.** Preset amount chips (250/500 mL, etc.) plus +/− steppers with
  `inputmode="decimal"`; tap logs a record with a confirm micro-animation (units 01, 02, 10).
- **Recent-entries list + inline edit.** Every card renders a "Recent" list (last 3–5) below its
  input; tapping a row swaps it for an in-place edit form (`InlineEditFormShell`: domain fields +
  datetime-local + note + Save/Cancel). Delete has a ~5s **Undo** toast (unit 08).
- **Modal/dialog editors.** History drawer and Analytics records tab edit the same records through
  full modal dialogs via a unified adapter (unit 08, 09, 23).
- **Segmented controls / toggles.** Active preset / size / arm / position / amount-estimate
  (small/medium/large) / day-of-week selectors render as tap-the-option segmented chips, never
  dropdowns or free-text (units 03, 05, 06). Defecation consistency/urgency is captured only via a
  free-text note — there is no Bristol scale.
- **Wizards.** Multi-step bottom-drawer flows for *setup* only — the Add-Medication wizard
  (branch-point first step, then progressive disclosure, segmented progress bar, per-step Zod
  validation, 3–6 dynamic steps) and the cloud-sync migration wizard (units 13, 42). Wizards are
  never the daily quick-add path.
- **Drawers / bottom sheets.** Detail, history, voice panel, and wizards layer over the current
  screen as sheets — **never a route change** — so dashboard context is never lost (units 09, 11, 13).
- **Accordions.** Settings is a single-open accordion of ~10 themed groups, each with nested
  expandable sub-sections (unit 27).
- **Floating thumb-bar + swipe nav.** A sticky top header with route tabs; edge-to-edge horizontal
  **SwipeNav** between the 5 top routes with drag-peek skeletons; a configurable **quick-nav
  footer** (scroll-to-section) on the dashboard; a **Voice log** launch bar; a context-aware **+ FAB**
  on Medications; scroll-driven hide/show of all chrome. Every primary action lives in the bottom
  third (unit 36).
- **Text-metrics summary.** A TODAY / THIS WEEK numeric widget with a weekly grid colored per domain
  (unit 07).
- **Voice + AI entry pipeline.** Mic → transcribe → parse → editable preview → commit, reused by
  food, liquids, and the bug reporter (units 02, 11, 46).
- **Global feedback layer.** Toasts (default/destructive/success, one at a time), welcome dialog,
  about dialog, shake-to-report bug/feature dialog, update banner, crash error-boundary (unit 37).

---

## 4. Global states matrix (every screen must handle)

The unit docs each carry a "States & presentations" section; these are the **cross-cutting** states
that recur and that an alternative must visibly design for, not just the happy path.

| State | What it means | Required grammar (per north-star) |
|---|---|---|
| **Empty** | No records yet for this card/range | Teach the first action; point at quick-add; never a blank "no data" wall. |
| **Loading** | Content fetching from Dexie | Shape-matched **skeletons**, not spinners; single in-flight confirm button may spin. |
| **Populated** | Has data | Hero number + status + sparkline/ring; glance-readable in ~3s. |
| **Validation error** | Bad form input | Inline, rule-specific message (name the failing rule); fields never wiped; toast on save failure. |
| **Submitting / pending** | A write is in flight | Optimistic write + "Logged · Undo"; button spinner only; sibling actions disabled. |
| **Over-target ("extended")** | Past the goal, calm zone | `progressExtended` fill + factual readout (`110% · +0.4 g`); amber/neutral text, **not** alarm-red. |
| **Over-limit** | Hard over the cap | `progressOverLimit` fill; still calm/factual — red reserved for clinical danger (e.g. BP crisis). |
| **Success** | Action committed | Confirm micro-animation (ring-fill/pulse) + optional success toast; explicit closure. |
| **Offline** | No network | Slate dot + "Offline — changes saved locally." Normal and safe; **never** red/destructive. |
| **Syncing** | Background replication running | Yellow ambient dot + ping + "Syncing N changes…"; determinate, not a spinner. |
| **Synced** | All changes pushed/pulled | Green dot + "All changes synced" + "Last synced …". |
| **Sync failed** | Push/pull errored | Yellow (not red-alarm) banner: problem + Retry + queue depth ("3 changes waiting"). |
| **Conflict** | Concurrent edits need review | Dismissible "Tap to review" — **never** blocks logging. |
| **Stale data** (analytics/AI) | Showing last-known | Quiet freshness line ("Showing saved data · 12:45"); render instantly, no blocking refetch. |
| **Disabled / gated** | Feature unavailable | AI features hidden when signed-out (manual path always works); reduced-motion collapses animation. |
| **Dark mode** | OS/user dark theme | Every token ships a `dark:` variant; elevation by lightness, hues desaturated. |

---

## 5. Information architecture (routes → feature-set mapping)

Five top-level routes are reachable by SwipeNav (order = swipe order), plus sub-surfaces:

| Route | Screen | Maps to units |
|---|---|---|
| `/profile` | Profile & medical context (optional, chip-based, skippable) | 33, 34 |
| `/` | **Dashboard** — budget + reading cards, quick-add, voice, quick-nav footer | 01–11, 36, 43 |
| `/medications` | **Medications** — schedule (pillbox) · prescriptions · meds/library · titrations · settings tabs + Add wizard | 12–20 |
| `/analytics` | **Analytics** — summary · correlations · records · titration tabs + controls/export | 21–26 |
| `/settings` | **Settings** — accordion of tracking/customization/AI/data/privacy/system groups | 27–32, 38, 41, 42, 44, 45 |
| `/history` | History drawer (unified record browse/edit) — sub-surface | 09 |
| `/help`, `/help/[slug]` | Help index + article (with live component previews) — sub-surface | 35 |
| `/auth/*` | Sign in / sign up / forgot / reset — sub-surface | 34 |

Cross-cutting / non-screen units underpin all of the above: data model & enums (39), settings store
& enums (40), card theming (10), navigation chrome (36), global dialogs (37), sync (38), substances
(46), debug tools (44), and the in-app MCP server (45).

---

## 6. Index of the 46 unit docs

1. Water / Liquids Input
2. Food + Salt + AI "What I Ate" Input
3. Blood Pressure Card
4. Weight Card
5. Urination Card
6. Defecation Card
7. TODAY / THIS WEEK Summary Widget (Text Metrics)
8. Recent Entries List & Inline Edit / Dialog System
9. History Drawer
10. CardShell + Domain Theming
11. Voice Entry
12. Medications: Schedule View
13. Add-Medication Wizard
14. Compound Library + Interactions
15. Prescriptions
16. Titrations
17. Dose Logging & Detail
18. Medication Inventory
19. Edit Medication
20. Medication Settings & Timezone
21. Analytics: Summary
22. Analytics: Correlations
23. Analytics: Records Table
24. Analytics: Titration Timeline
25. Analytics Controls + Export
26. Analytics Engine (Services)
27. Settings Shell + Account
28. Tracking Settings
29. Customization Settings
30. AI Keys, Medical-AI Consent & Security
31. Data & Storage Settings
32. Privacy/Permissions + System Settings
33. Profile & Medical Context
34. Auth Flows
35. Help / User Manual
36. Navigation Chrome
37. Global Dialogs & Feedback
38. Sync (UI + engine)
39. Data Model & Enums (Canonical)
40. Settings Store & All Settings Enums
41. Push & Medication Notifications
42. Backup, Restore & Cloud-Sync Migration
43. Daily Notes
44. Debug Tools
45. In-app MCP Server (Claude.ai Custom Connector)
46. Substances (Caffeine / Alcohol) Tracking

---

## 7. Guidance for an alternative-design generator

The unit docs define the **functional contract**; this overview and the companion brief define the
**spirit**. Your job is to reimagine the surface — not to remove capability.

**You may freely change:** layout and grid, color system and theming, visual hierarchy and emphasis,
typography, iconography style, motion and transitions, navigation metaphor, the *style* of inputs
(as long as the input kind survives — e.g. a tap-scale may be re-skinned but not turned into a
dropdown), card shapes, chart styling, and overall mood.

**You must preserve — drop NO functionality:**

1. **Every feature** in each unit's "Features" section.
2. **Every action** in "User actions & interactions" (every tap, swipe, edit, delete, undo, toggle,
   wizard step, export, sync trigger).
3. **Every state** in "States & presentations" *and* the global matrix in §4 (empty/loading/error/
   offline/syncing/synced/sync-failed/conflict/stale/over-target/over-limit/success/validation/
   disabled/dark). Design each one — do not ship only the happy path.
4. **Every enum / option / configurable value** in "Enums, options & configurable values" (e.g. BP
   categories — the 6-tier ESH grade scale Optimal / Normal / High normal / Grade 1–3 hypertension —
   amount-estimate options small/medium/large, stored dose states taken/skipped/rescheduled/pending,
   frequency presets, day-parts, settings ranges). The UI must be able to represent exactly these
   values — no more, no less.
5. **Every validation rule and edge case** in "Validation, edge cases & business rules."
6. **All 11 tracked domains and the two card variants** (Budget vs Reading) — never force a reading
   metric into a progress-toward-goal shape.
7. **The redundant-channel rule** — color is never the sole carrier of meaning; keep icon + label
   alongside every domain/status hue, distinguish CVD-colliding domains by icon + label.
8. **Local-first behavior** — instant render off local data, optimistic writes, one ambient sync
   signal, non-blocking conflict review.

When in doubt, the unit doc wins on *what must exist*; the companion brief wins on *tone and the
DO-NOT list*; you win on *how it looks and feels*. Test every choice against the north-star in §1:
faster glance, easier log, never judged.
