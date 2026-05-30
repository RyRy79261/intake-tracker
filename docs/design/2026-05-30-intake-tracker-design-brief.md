# Intake Tracker — Design Brief

**Date:** 2026-05-30
**Status:** Canonical design reference for a faithful recreation first, alternatives second.
**Surfaces:** Dashboard · Medications · Analytics · Settings · Profile · Help · Auth
**Platform:** Offline-first, mobile-first PWA — Next.js 16, React 19, Tailwind, shadcn/ui, Dexie/IndexedDB, single user.

> This brief is grounded in the *actual* codebase, not an idealized one. Where it says "today the app does X," that X was verified in source (`src/lib/card-themes.ts`, `src/app/globals.css`, `src/components/blood-pressure-card.tsx`, etc.). The extracted design tokens in §10 are **ground truth** — this brief builds on them and disciplines them; it does not replace them.

---

## 1. Executive Summary & North Star

Intake Tracker is a **private, single-user daily health log** — water, salt, blood pressure, weight, bowel/bladder, food, and medications — used to manage real conditions on a phone, one-handed, often offline. It is **not** a coaching product, not a clinic, not a social/engagement app. That single fact decides almost every contested design question: there is no growth KPI to optimize, so every mechanism that exists to drive "engagement" (streaks, guilt nudges, alarm-red shaming, leaderboards) is pure downside here. The app's job is to be a **calm, trustworthy mirror the user can put down.**

The app already has the *right bones*: a `max-w-lg` thumb-zone shell, a signature gradient `CardShell` per domain, tab-based liquid inputs, `RecentEntriesList` with inline edit, multi-stage progress coloring, a real Dexie→Neon sync engine, and a voice quick-entry pipeline. What it lacks is **discipline and warmth**: 10+ domain hues that collide for color-blind users, a hardcoded `bg-red-500` "you failed today" state on every card, proportional (jittering) numerals in a number-dense UI, binary clinical thresholds, no optimistic writes, and a sync/offline feedback layer that is half-built. This brief fixes those without throwing away the bones.

### North-Star Sentence

> **Every screen should let the user answer "am I on track, and is everything safe?" in under three seconds, log the next entry in under two taps, and never feel judged for the answer.**

Test every decision against it. If a choice makes the glance slower, the log harder, or the feedback more moralizing, it is wrong — even if it is "more engaging."

### Three operating principles (the spirit of the whole brief)

1. **Information, not verdicts.** Show `110% of target`, not a red panic. Color is a *channel*, never a *judgment*. Reserve true red for genuine clinical danger only.
2. **Local is the truth; the network is a detail.** The UI renders instantly off IndexedDB and never waits on a spinner. Sync is communicated through one quiet ambient signal, never per-action.
3. **Color is one of four redundant channels** (icon + label + shape/position + color), never the sole carrier of meaning. With 10+ domains this is non-negotiable, not a nicety.

---

## 2. Brand & Visual Language

### 2.1 Voice & personality

Calm, competent, quietly warm. The product equivalent of a well-organized paper journal with a good pen — not a fitness coach, not a hospital chart. Copy is plain-language and non-clinical ("twice a day," not "BID"; "dose change," not "titration" as a primary label). Microcopy never scolds; an over-budget day is described, not graded.

### 2.2 Color — start from the extracted tokens, then impose discipline

**Ground truth (do not invent a new palette).** Base tokens are authored as HSL custom properties consumed via `hsl(var(--token))`; the `CardShell` themes in `src/lib/card-themes.ts` map each domain onto Tailwind utility scales (sky/amber/emerald/rose/…). Both layers stay. The base UI palette is a cool blue-grey neutral — keep it:

- Light: `--background 220 20% 97%`, `--foreground 220 20% 10%`, `--primary 220 70% 50%`, `--destructive 0 84% 60%`, `--border 220 15% 88%`.
- Dark: `--background 220 20% 8%` (correctly *not* pure black), `--card 220 20% 12%`, `--foreground 220 10% 95%`, `--primary 210 100% 60%`.

**The core problem to solve:** the app has **10+ domain hues** (water/salt/sugar/potassium/weight/bp/eating/urination/defecation/caffeine/alcohol/medication) and several already collide — `weight 160°` ≈ `medication 168°` (an <8° gap that vanishes under deuteranopia); `water 200°`/`urination 258°`/`primary 220°` are three blues; `salt 30°`/`eating 25°`/`caffeine 48°` are one warm cluster. Beyond ~8 categories, **no hue set survives all color-vision-deficiency (CVD) types plus grayscale.** You cannot fix this by "picking prettier hues." You fix it structurally.

**The two-axis color system (the single most important rule in this brief).** Split color into two orthogonal jobs:

1. **Identity tint (per domain).** Used *only* to flavor the domain's icon chip, card header, gradient wash, and chart series. It answers "*which* metric is this?" It must **never** encode a value. The salt card looks salt-colored at 20% of budget and at 200%.
2. **Status scale (shared, identical everywhere).** A small fixed vocabulary that answers "*how am I doing?*" — `on-track` → `approaching` → `over` → (rarely) `danger`. The status drives the progress fill and the number's treatment. The user learns this language **once** and applies it to all 10 domains.

This is the WHOOP/Apple-Activity discipline: every hue carries meaning, nothing is an arbitrary accent. It is also what lets 10 domains coexist without chaos — identity is decoration, status is information, and they never fight.

**Identity-tint rules.**
- Treat the extracted domain hues as the *identity* layer and keep their existing `CardShell` Tailwind mappings for visual continuity (a faithful recreation should look like today's app).
- Where two domains collide for CVD (`weight`↔`medication`, the three blues, the warm cluster), **do not rely on the hue to distinguish them** — distinguish by the required **icon + label** (see §2.4). The hue can stay; it is simply no longer load-bearing.
- For any *new* domain (sugar, potassium already exist; resist a 13th/14th hue), differentiate with icon + label, not a new color.

**Status-scale rules (replaces the hardcoded alarm-red).**
- Today every theme hardcodes `progressOverLimit: "bg-red-500"` and several cards flip the live number to `text-red-600`. **This is the app's headline anti-pattern.** Red reads to the nervous system as *danger/failure*; using it for "you had a bit too much salt" manufactures daily guilt.
- Replace with a **graduated, calm status scale**: `on-track` (the domain's own progress gradient) → `approaching` (the domain's *deepened* hue, e.g. the existing `progressExtended`) → `over` (**amber/neutral, not red**) → `danger` (**red, reserved exclusively** for medically urgent readings, e.g. hypertensive crisis).
- "Over budget" on a personal log is normal and survivable. Render it as a calm "over" state plus a factual readout (`110% · +0.4 g`), never as alarm-red.

**Contrast & tinted-card rules.**
- The current pattern of saturated mid-lightness fills with white/black foreground (`caffeine 48° 96% 53%` black fg; `alcohol 292° 84% 61%` white fg) risks failing 4.5:1 body-text contrast. Prefer the **"tint background + strong foreground"** model the `CardShell` gradients already lean toward: a low-saturation tint as the card wash, full-strength foreground text (≥4.5:1), and the *saturated* color reserved for the icon chip and a left accent — which doubles as a non-color (shape/position) cue.
- **3:1 minimum** for meaningful non-text graphics and UI component boundaries (WCAG 1.4.11); **4.5:1** for body text, **3:1** for large text.
- Dark mode: keep the ~`220 20% 8%` base (good), build elevation from **progressively lighter surfaces, not shadows**, and **desaturate** domain hues on dark so saturated blues/reds/greens don't vibrate/halate. The app already hand-tunes per-domain dark values — formalize that as "desaturate for dark," not bespoke guessing.

### 2.3 Typography — Outfit display + a dense-data body scale

**Ground truth:** Outfit via `next/font`; `font-feature-settings: "rlig" 1, "calt" 1`.

**The one-line fix first:** `tnum` is **not** enabled globally, yet this is a number-dense app. Numbers in budgets, recent-entry rows, and the records table jitter and misalign with proportional digits. Add `font-variant-numeric: tabular-nums` to all numeric containers (budget readouts, recent-entry amounts, the analytics records table, chart axis labels). Outfit's designer shipped tabular numerals by explicit intent — activate them. *(Note: today only a scattering of components opt in via the `tabular-nums` class — `weight-card`, `water-tab`, `beverage-tab`, `text-metrics`; make it the default for numeric UI, not an opt-in.)*

**Two-font hierarchy.** Outfit is a *display* face — wide, generous-leading, no italics — excellent for headings and the single oversized "one big thing" hero metric per card. It is *not* ideal for dense list rows and table cells. Pair it with a tighter, high-x-height workhorse for body/table/label text (**Figtree** pairs natively with Outfit; **Inter/Geist** are strong for tabular data). Since Outfit has no italics, use **weight**, not slant, for emphasis.

**Type scale (mobile, `max-w-lg`):**
| Role | Family | Size / weight | Notes |
|---|---|---|---|
| Hero metric (one per card) | Outfit | `text-3xl`–`text-4xl` / 700, `tabular-nums` | The "am I on track" number. |
| Card / section title | Outfit | `text-base`–`text-lg` / 600 | |
| Body / list row | Body face | `text-sm` / 400–500, `tabular-nums` for values | High x-height for legibility at 14px. |
| Secondary / unit / caption | Body face | `text-xs` / 400, muted-foreground | Units, timestamps, "of target." |
| Numbers everywhere | either | **always `tabular-nums`** | Columns must align. |

### 2.4 Iconography — Lucide, as a required channel

Lucide is already in use (`Droplets`, `Sparkles`, `Scale`, `Heart`, `Utensils`, `Droplet`, `CircleDot`, `Coffee`, `Wine`, `Candy`, `Banana`, …). Elevate iconography from decoration to a **required redundant channel**: define a per-domain **token triple** `{ hue, lucide icon, short label }` and render all three together everywhere a domain appears — card header, quick-add chip, chart series, recent-entry row. This single change satisfies WCAG 1.4.1 (color is never the only meaning) and makes the exact hue almost irrelevant, which is exactly what neutralizes the `weight↔medication` and three-blues collisions. Icons sit in the saturated tint chip (the one place strong color lives); 24px nominal, with a ≥44px hit area when interactive.

### 2.5 Texture & elevation

Flat, low-ink, Tufte-lean. The signature gradient `CardShell` (existing `from-*-50 to-*-50` washes) is the brand texture — keep it as a *quiet* identity wash, not a saturated fill. Radius `--radius 0.75rem` (lg 12 / md 10 / sm 8). Card padding `p-6`; vertical rhythm `space-y-4` / `mb-6`. Elevation in dark mode is lightness-based (surface ladder), not shadow-based. Avoid chart chrome, heavy borders, and decorative gridlines — every pixel of clutter on a 512px column costs a metric.

### 2.6 Motion — transform/opacity only, motion-safe

- Animate **only `transform` and `opacity`** (GPU-cheap, no layout thrash). No animating width/height/top/left.
- All motion gated behind `motion-safe:` / `@media (prefers-reduced-motion: no-preference)` (the app already wraps `scroll-behavior`); the Zustand UI-animation-timing setting must collapse to 0 when reduced motion is requested, and Settings should expose a "Reduce motion" toggle mirroring the OS.
- **Keep** the satisfying log-confirmation micro-animation (a brief ring-fill/pulse on quick-add) — it is the reward for the most frequent action. **Skip** any mascot/avatar/celebration character — tonally wrong for a personal health log and pure maintenance burden.
- `SwipeNav` route transitions: transform-based, short (≤250ms), reduced-motion-safe.

---

## 3. Information Architecture & the 14 Screens

Four top-level routes reachable by `SwipeNav` (swipe between Dashboard ↔ Medications ↔ Analytics ↔ Settings) plus a persistent thumb-zone footer; Profile/Help/Auth are sub-surfaces. Every primary action lives in the bottom third.

| # | Artboard | Must contain |
|---|---|---|
| 1 | **Design system** | Token triples (hue + icon + label) for all domains; the two-axis color model (identity tint vs status scale) with swatches in light/dark and a grayscale + deutan/protan/tritan proof strip; type scale with `tabular-nums` demo; `CardShell` anatomy; progress states (on-track/approaching/over/danger); button/input/chip/sheet primitives; focus-ring spec; 44px target overlay. |
| 2 | **Dashboard** | Two-tier hierarchy: 1–2 **hero** budget cards (water, sodium) with ring + pace marker on top, then a stack/2-up grid of compact secondary cards. Each card = identity header (icon+label+tint) + hero number + status + quick-add chips + (event cards) sparkline. Floating thumb-bar quick-add + voice launcher. Per-card "glance state" readable top-to-bottom in 3s. Hide/reorder affordance (gear). Ambient sync indicator. |
| 3 | **Medications — schedule** | Virtual-pillbox: day-part sections (morning/noon/evening/bedtime) of dose cards; week-day selector; per-dose tri-state (taken/skipped/missed) one-tap; "2 of 4 taken" progress; back-date/edit affordance; low-supply badge. Must look like the dashboard, not a different product. |
| 4 | **Medications — other tabs** | Compound library (searchable), prescriptions list, inventory (computed days-of-supply + refill nudge), titrations entry point. Reuse `CardShell`/`RecentEntriesList`. |
| 5 | **Add-medication wizard** | Branch-point first step (Search library / Scan / Enter manually) *before* any fields; then progressive disclosure: name (autocomplete from compound library, manual escape hatch) → strength → **frequency preset** ("twice a day" auto-expands editable time rows) → start date → reminder window (plain language) → confirm. |
| 6 | **Analytics — summary / correlations** | Three altitudes: at-a-glance stat cards (value + per-metric-directional delta + sparkline) → focused single-metric trend vs personal baseline → correlation/co-occurrence view + per-metric calendar heatmap. Time-range selector (24h/7d/30d/90d/all). Optional AI insights (stale-while-revalidate, calm "showing saved data" freshness line). |
| 7 | **Analytics — records / titration** | Records table with category-colored, dual-encoded (bold+color+icon) out-of-range values; CSV/PDF export as a first-class ownership action; titration **step timeline** (horizontal, current step highlighted, exact amount+unit+concentration per step, editable past entries). |
| 8 | **Settings** | Large. Increments/limits/goals per domain; theme; day-start-hour; **dashboard card hide/reorder**; quick-add preset editor; **sync on/off toggle** (framed as a choice, plain copy); "Sync now / last synced"; reduce-motion; export; easy account/data deletion. |
| 9 | **Profile (medical context)** | Optional, chip-based condition/factor capture with custom entries; per-field "why we ask" info affordance; "skip for now, edit later." **Never gate the dashboard behind this.** |
| 10 | **Auth — sign in** | Privacy headline ("Your data lives on this device — encrypted; even we can't read it."); email persistence; show-password toggle; requirement-specific errors; passkey/biometric primary path; email + Google fallback; "explore before you commit." |
| 11 | **Auth — sign up / forgot / reset** | Email pre-filled across the flow (never re-ask); fields never wiped on failed attempt; password errors name the failing rule; post-first-login "set up Face ID?" enroll prompt. |
| 12 | **Help — index** | Searchable, scannable topic list; plain-language; links into contextual help. |
| 13 | **Help — article** | Single-column readable article; body face; "why we ask"/data-handling notes where relevant. |
| 14 | **Key dialogs / states** | Empty states (teach the first action, point at quick-add); skeletons (shape-matched, not spinners); optimistic "Logged · Undo" snackbar; offline/syncing/synced/failed indicators; conflict-review drawer (non-blocking "tap to review"); install prompt (deferred, contextual, iOS instruction sheet); error states with retry + queue depth. |

---

## 4. Per-Domain Card Design — the CardShell pattern

### 4.1 CardShell anatomy (existing, keep it)

`CardShell` = gradient identity wash + **header** (icon chip + label + right-side stat/progress) + **body** (input/quick-add/recent). It is the brand's atomic unit. Two semantic *variants* matter — split cards by **what the metric IS**, not just by topic:

- **BudgetCard** — metrics that *accumulate toward a daily target and can go over*: water, sodium, sugar, potassium, caffeine, alcohol. Visual: progress ring/bar fill + `remaining`/`over by` readout + a **pace marker** ("where you should be by this hour") + quick-add chips.
- **ReadingCard** — *events/logs with no daily goal*: BP, weight, urination, defecation. Visual: last value + a small 7-day sparkline + today's count + quick-log. **No progress-toward-goal visual** — implying a target that doesn't exist misleads the glance.

Forcing all domains into one shape is what makes multi-metric dashboards feel wrong. One shell, two variants.

### 4.2 Per-domain principles

| Domain | Variant | Hero of the card | How it should feel / visualize |
|---|---|---|---|
| **Water** (and liquids: beverage/coffee/alcohol tabs) | Budget | Progress **ring** with fill, + `remaining mL` | The flagship. Vessel-fill metaphor, pace marker (ahead/behind by this hour). Each liquid sub-tab owns one persistent identity color reused in chip, ring fill, and recent-entry row. One-tap presets (250/500 mL) on the card face. Satisfying fill-pulse on log. |
| **Salt / sodium** (food+salt; optional sugar, potassium) | Budget | `remaining mg` + ring/bar | Second hero. Calm "over" state (amber/neutral) — **not** the current `text-red-600`. Sugar/potassium are secondary budget readouts under the same card. Factual over-readout: `2,400 mg · 120% of target`. |
| **Blood pressure** | Reading | Last `sys/dia` + category chip | **Graduated risk ladder** (Normal / Elevated / Stage 1 / Stage 2 / Crisis), not today's binary `pulsePressureColor` red. A single borderline reading must look different from an emergency. 7-day sparkline of systolic/diastolic. Optional context tag (home/clinic). |
| **Weight** | Reading | **Smoothed trend** value, not raw | Default to an EWMA/moving-average trend (hide water-weight noise); raw readings as faint background dots. Tiny 7-day sparkline. Down is the "good" direction — directional delta coloring (see §5). |
| **Urination** | Reading | Today's count + last time | Tap-an-icon volume/urgency scale + tag chips, never dropdowns/free-text. Distinguish from water by **icon + label** (both are blue-ish). Recent rows show the chosen chip. |
| **Defecation** | Reading | Today's count + last Bristol type icon | **Bristol Stool Scale picker**: tap the illustrated type (1–7), not a dropdown; show the chosen type as a small icon in recent entries. Earthy/neutral identity tint distinguished by its distinct icon. |
| **Medications** (schedule card) | Reading-like | "2 of 4 taken" + next dose | Virtual-pillbox feel; tri-state one-tap; low-supply badge from computed days-of-supply. Teal identity — distinguished from weight (also teal) by **icon + label**, never hue alone. |

### 4.3 Glance state (every card, even collapsed)

Even when collapsed, a card communicates today in one line: **status color + one number + a tiny sparkline/ring**. The dashboard must read top-to-bottom in ~3 seconds. Detail (recent entries, manual entry, inline edit) lives behind a tap — inline expand or a **bottom sheet layered over the dashboard**, never a route change, so context is never lost.

---

## 5. Data-Viz & Analytics Guidance

**Ranges/zones beat threshold lines.** Behind the BP chart, render **category goal-range bands** (Recharts `<ReferenceArea>`: Normal <120/80, Elevated 120–129, Stage 1 130–139/80–89, Stage 2 ≥140/90), each band a desaturated version of its severity color so the line reads over it. "In range vs out" then reads pre-attentively, before any number.

**Smooth the trend, fade the noise.** Weight (and arguably BP) default to a **smoothed line** (EWMA ≈ 20-day) with raw points as faint background dots. The trend is the truth; the dots are noise. Never lead with a single raw reading on a noisy metric — it makes normal fluctuation look like failure.

**Like-with-like color pairing.** Each series pairs with its own-hued band (systolic line + systolic band in the same family, diastolic likewise) so users match data to its target by color alone — *plus* a distinct **dash pattern + end-of-line label** so it survives CVD and grayscale PDF export.

**Per-metric directionality is mandatory.** "Up = green" is wrong here. For weight, sodium, BP, and alcohol, **down** is the good/green direction. Make "desired direction" a per-metric prop on the stat card so deltas color correctly. Never default to up=green.

**Time-in-range bar.** For any zoned metric, an AGP-style horizontal stacked bar ("% of BP readings in each category this period") is a compact, glanceable period summary — far better than counting dots.

**Mobile legibility = subtract.** Cap at **2–3 series** per chart. Label only first/last/today + min/max. Replace hover tooltips with a **tap/drag scrubber** (hover doesn't exist on touch). **Aggregate before plotting** (24h/7d raw → 30d daily mean → 90d ~3-day → all weekly) so you never plot 365 dots on 512px; dash the line where >10% of a window is missing.

**Correlations are the differentiator.** Don't ship Analytics as line charts only. Add a **factor co-occurrence / correlation view** ("what tends to co-occur with high BP") and a **per-metric calendar heatmap**. Overlay **medication/titration change markers** (thin vertical reference lines with a pill glyph) on health trends so dose changes visibly align with metric responses — this app tracks *outcomes alongside meds*, which the consumer leaders cannot do.

**Always ship the numbers.** Put a compact "last N readings" table next to/under each chart, with out-of-range values dual-encoded (bold + color + icon). A chart-only view feels untrustworthy for health data.

**Centralize tokens.** Don't scatter hardcoded inline HSL literals across chart components; reference one semantic token set (in-range/elevated/warning/critical/improving) mapped to a CVD-safe palette so theming and dark mode work mechanically.

---

## 6. Hard DO NOT List

1. **DO NOT** use alarm-red (`bg-red-500` / `text-red-600`) as the default "over budget" state on any card. Red = danger only (e.g. hypertensive crisis). "Over" is calm (amber/neutral + factual readout).
2. **DO NOT** use binary clinical thresholds that jump straight to red (today's `pulsePressureColor`). Use a graduated risk ladder so borderline ≠ emergency.
3. **DO NOT** add streaks with zero-reset, guilt notifications, loss-aversion copy, "days logged" vanity stats, badges, points, or leaderboards. There is no engagement KPI to justify the harm.
4. **DO NOT** let color be the sole carrier of meaning. Always pair with icon + label (+ shape/position for status). ~8% of men can't reliably separate the existing collisions.
5. **DO NOT** grow the domain hue count further or rely on hue to tell colliding domains apart (`weight↔medication`, the three blues, the warm cluster) — differentiate by icon + label.
6. **DO NOT** ship a number-dense app without `tabular-nums`. Activate Outfit's tabular figures globally on numeric UI.
7. **DO NOT** use Outfit for dense body/table text — pair a tighter high-x-height face for rows/cells/labels.
8. **DO NOT** force event/reading metrics (BP, weight, urine, stool, meds) into a "progress toward goal" card shape.
9. **DO NOT** put spinners on local writes or behind a full-screen blocking loader. Optimistic write + "Logged · Undo" snackbar; skeletons (not spinners) for content; spinner only on a single in-flight confirm button.
10. **DO NOT** color the offline state red or route it through the destructive token. Offline is normal and safe for a local-first log.
11. **DO NOT** use spinning wheels as the sync indicator, or per-field "last synced" timestamps. One global ambient state-icon (sync glyph → checkmark) + "last synced" + "Sync now."
12. **DO NOT** block the user mid-log to resolve a conflict — defer to a dismissible "tap to review" drawer.
13. **DO NOT** use dropdowns or free-text for qualitative logging (Bristol type, urgency, severity) — tap-the-icon scales + tag chips.
14. **DO NOT** bury the primary log action behind a multi-step modal, or place the primary "+" outside the bottom thumb zone. Wizards are for setup, never daily quick-add.
15. **DO NOT** force a wall of all domain cards on every user — let them hide/reorder.
16. **DO NOT** gate the dashboard behind a mandatory medical-history form; medical context is optional, chip-based, skippable.
17. **DO NOT** ship dark patterns: pre-checked sync/sharing, buried deletion, hidden export, silent cloud upload. Visible export + easy delete prove the "we can't read it" claim.
18. **DO NOT** plot >3 series, plot every datapoint over long ranges, label every point, or rely on hover tooltips on a touch app.
19. **DO NOT** use raw `type="number"` for quantity entry — use stepper + quick-chips + `inputmode="decimal"`, validating on blur.
20. **DO NOT** write moralizing labels ("cheat," "bad," "unhealthy") or scolding save copy. Acknowledge progress factually, never shame a missed day.

---

## 7. Accessibility & Performance Requirements

### 7.1 Contrast & color-blind-safe coding
- **WCAG two-rule model:** 1.4.1 Use of Color (Level A — meaning never by color alone) **and** 1.4.11 Non-text Contrast (Level AA — 3:1 for meaningful graphics/UI boundaries). Passing one does not satisfy the other.
- Body text ≥4.5:1; large text ≥3:1; verify the white/black-on-saturated tinted cards (`caffeine`, `alcohol`, `salt`) and re-base to tint-bg + strong-fg where they fail.
- **Per-domain token triple (hue + icon + label)** rendered together everywhere — the structural fix for 10+ domains.
- Validate every palette change through a CVD simulator (deutan/protan/tritan) **and grayscale** before merge; grayscale legibility is the fastest proxy for "passes all CVD types."
- Charts double-encode: dash patterns (lines) + point shapes (scatter) + direct labels; never legend-by-color alone.

### 7.2 Targets, focus, motion
- **44×44px** minimum touch targets on quick-add chips, week-day/dose selectors, floating-bar buttons, inline-edit controls (`min-h-11 min-w-11`; add invisible hit-area padding for small icons). WCAG's 24px floor is not enough for one-handed logging.
- **Focus-visible rings** globally: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`, ≥2px, ≥3:1 against both component and page (WCAG 2.4.13). It's a PWA on desktop too — keyboard matters.
- **Reduced motion:** gate `SwipeNav` transitions, count-ups, ring fills behind `motion-safe:`; collapse the Zustand animation-timing setting to 0 when the media query matches; expose a Settings toggle.

### 7.3 Performance
- Animate only `transform`/`opacity`. Pre-allocate skeleton layout to eliminate CLS.
- Aggregate chart data before render; never mount 365 points on a phone.
- Optimistic writes keep the UI off the network entirely for logging.

### 7.4 PWA / Offline states matrix

| State | Visual grammar | Copy / behavior |
|---|---|---|
| **Offline** | Grey/slate dot + icon (**never** red/destructive) | "Offline — changes saved locally." Normal and safe. |
| **Syncing** | Light-blue + sync glyph (determinate, **not** a spinner) | "Syncing N changes…" Contextual, only where data will change. |
| **Synced** | Checkmark + color/text change | "✓ All changes synced." Explicit closure, surfaced contextually (dashboard/history header). |
| **Sync failed** | Light-yellow + failure icon (**not** red alarm) | Problem + next step + **Retry now**; show **queue depth** ("3 changes waiting") so nothing feels lost. |
| **Conflict** | Dismissible "Some changes need review · Tap to review" | Opens the non-blocking conflict-review drawer; never interrupts logging. |
| **Stale data** (analytics/AI) | Quiet freshness line | "Showing saved data · last updated 12:45." Render last-known instantly; no blocking refetch. |
| **Loading content** | Shape-matched skeletons | Lists/cards = skeleton; single action = inline spinner on the button only. |
| **Empty** | Teaches the first action | Point at quick-add; never a blank "no data" wall. |
| **Install** | Deferred, contextual card after engagement | Capture `beforeinstallprompt`; separate iOS "Add to Home Screen" instruction sheet (iOS fires no event). |

*Implementation note for the recreation: add optimistic `onMutate` handlers to the React Query mutations (currently absent) — cancel in-flight queries, snapshot, write Dexie + `setQueryData` immediately, roll back on error, invalidate on settle. This is the single highest-impact local-first change.*

---

## 8. Reference Gallery — "Steal This One Thing"

| Product | Steal exactly this |
|---|---|
| **WaterMinder** | The "dotted pace line" — where consumption *should* be by this hour. Turns a raw total into ahead/behind/on-track for every budget card. |
| **Waterllama** | Each beverage type owns a fixed hue reused across preset, ring fill, and home — self-documenting multi-drink dashboard. (Steal the color system, not the llama.) |
| **Happy Scale** | Default weight to a smoothed moving-average trend that hides daily noise; user-hideable summary cards via a gear. |
| **Qardio** | WHO/ACC color-coded BP zones on charts + optional context tag (home/clinic) per reading. |
| **Guava** | Adjective-tag chips + body-map + severity scale for fast qualitative logging; co-occurrence + calendar-heatmap analytics. |
| **Bearable** | Calm "5-minute ritual" many-domain log; weekly factor-vs-average correlation reports; skippable chip-based setup. |
| **Bristol Stool Chart apps** | Tap-the-illustrated-type (1–7) picker; show chosen type as an icon in recent entries. |
| **WHOOP** | Narrow 3-color status vocabulary meaning the same thing everywhere; oversized hero metric; dark bg so data pops. |
| **Apple Activity Rings** | Three fixed, never-recolored semantic colors + icon/label as one inseparable unit — color as a learnable language. |
| **Radix Colors** | 12-step role scale (1–2 bg, 3–5 component states, 6–8 borders, 9–10 solid, 11–12 text) with auto dark mode. |
| **Okabe-Ito / Wong** | The 8 CVD-safe hex codes with distinct luminance — the spine to extend, not invent from scratch. |
| **IBM Carbon (data-viz)** | Hand-curated palette *order*; dash patterns + filled/outlined point shapes as redundant chart channels. |
| **Round Health** | Forgiving plain-language "reminder windows"; dual dose-confirm (swipe-from-notification + tap-a-circle). |
| **Taper** | Titration as a visual step timeline (current step highlighted, exact amount/unit/concentration, editable past entries). |
| **Medisafe** | "Virtual pillbox" daily-card mental model; calm color-coded adherence at a glance. |
| **Universal Medication Schedule** | Group doses into 4 named day-parts (morning/noon/evening/bedtime). |
| **Linear / RxDB** | "No spinners because there's nothing to wait for" — optimistic `onMutate` everywhere; server is a background sync target. |
| **Google Open Health Stack** | Health-specific sync grammar: grey=offline, blue=syncing, check=synced, yellow=failed; never make connectivity look like an error. |
| **Gmail undo-send / Material snackbar** | Optimistic write + "Logged · Undo" instead of confirm-then-toast. |
| **Apple Health (privacy page)** | Verbatim-style trust copy: "encrypted and inaccessible by default," "you remain in control." |
| **Obsidian / Flo Anonymous Mode** | Opt-in, reversible, plainly-stated sync; "notes never leave your device unless you choose." |
| **Duolingo (as anti-pattern)** | Proof guilt copy is *engineered* (5–8% lift). The exact tone to **never** adopt. |
| **MyFitnessPal (as anti-pattern)** | Green-under/red-over coding rewards restriction. The exact color semantics to fix. |
| **SilverCloud** | Deliberately removed login/usage stats because they become guilt proxies — the calm single-user blueprint. |

---

## 9. Opinionated Decisions for Intake Tracker

These are the calls to make. A faithful recreation honors today's look; these refinements sit *on top* of it.

1. **Palette:** Keep the extracted domain hues as the **identity** layer and their `CardShell` Tailwind mappings for visual continuity. Add a **shared status scale** (`on-track` → `approaching` → `over` (amber/neutral) → `danger` (red, clinical-only)) and stop using `bg-red-500`/`text-red-600` as the generic over-budget state. Resolve CVD collisions with **icon + label**, not new hues.
2. **Type:** Keep **Outfit** for headings + the one hero metric per card. Add a tighter body face (**Figtree**, or Inter/Geist for tables) for rows/cells. Turn on **`tabular-nums` globally** for numeric UI.
3. **Hero of each card:**
   - Water/liquids → **ring + remaining + pace marker** (Budget).
   - Sodium (+ sugar/potassium) → **remaining + ring/bar** (Budget).
   - BP → **last sys/dia + category-band chip** (Reading; graduated ladder).
   - Weight → **smoothed trend value + sparkline** (Reading).
   - Urination → **count + last time** (Reading; icon/chip scale).
   - Defecation → **count + last Bristol type icon** (Reading).
   - Medications → **"N of M taken" + next dose** (pillbox).
4. **States:** Optimistic write + **"Logged · Undo"** everywhere; **skeletons** (not spinners) for content; the **offline matrix in §7.4** for sync; **non-blocking** conflict review; deferred contextual install prompt with an iOS sheet.
5. **Dashboard:** **Two-tier** (hero water+sodium, then compact grid); **hide/reorder** cards and quick-add presets; per-card **glance state**; bottom-sheet detail, never route changes; floating thumb-bar quick-add + voice.
6. **Medications:** **Day-part virtual pillbox**, **tri-state** one-tap dosing, **back-dating** everywhere, **frequency presets** that auto-expand, **branch-point** wizard step, **computed days-of-supply** with a low-supply badge, **Taper-style titration timeline**.
7. **Trust:** Lead auth/landing with the **local-first privacy headline**; **just-in-time** consent (mic, AI-parse PII-stripping, sync); **email persistence + passkey** auth; **sync as an explicit toggle**; **export + easy delete** as first-class ownership proofs.
8. **Friction:** A **text** natural-language quick-add reusing the existing voice→parse→verify pipeline; **stepper + chips** quantity entry; a **"when"** control (Now / −15m / −1h / custom) for retroactive logging; **swipe-to-act** recent rows; **"same again"** one-tap repeat.
9. **Tone:** No streaks, no guilt, no vanity stats. Factual over-readouts. Keep the satisfying log micro-animation; skip the mascot.

---

## 10. Grounding Note — Exact Extracted Tokens (ground truth)

These are verbatim from the codebase. The brief disciplines their *use*; it does not replace them.

- **Font:** Outfit (`next/font`), `font-feature-settings: "rlig" 1, "calt" 1` (today **lacks** `tnum` globally — add it).
- **Container:** `max-w-lg` (≤512px), `px-4`. **Radius:** `--radius 0.75rem` (lg 12 / md 10 / sm 8). **Card padding** `p-6`; **rhythm** `space-y-4` / `mb-6`.
- **Theme:** `next-themes`, class-based, `defaultTheme system`; colors via `hsl(var(--token))`.
- **Base light:** `--background 220 20% 97%`, `--foreground 220 20% 10%`, `--card 0 0% 100%`, `--primary 220 70% 50%`, `--destructive 0 84% 60%`, `--border 220 15% 88%`, `--ring 220 70% 50%`.
- **Base dark:** `--background 220 20% 8%`, `--foreground 220 10% 95%`, `--card 220 20% 12%`, `--primary 210 100% 60%`, `--destructive 0 72% 51%`, `--border 220 15% 22%`.
- **Domain hue tokens (HSL, light):** water `200 85% 55%` · salt `30 80% 55%` · weight `160 84% 39%` · bp `350 89% 60%` · eating `25 95% 53%` · urination `258 90% 66%` · defecation `33 25% 45%` · caffeine `48 96% 53%` (black fg) · alcohol `292 84% 61%` · medication `168 76% 36%`. (Dark variants are hand-tuned, slightly lighter/desaturated — formalize as "desaturate for dark.")
- **`CardShell` themes** (`src/lib/card-themes.ts`) map each domain onto Tailwind scales (water→sky/cyan, salt→amber/orange, sugar→pink/rose, potassium→purple/indigo, weight→emerald/teal, bp→rose/pink, eating→orange/amber, urination→violet/purple, defecation→stone/amber, caffeine→yellow/amber, alcohol→fuchsia/pink). **Every theme currently hardcodes `progressOverLimit: "bg-red-500"` — the headline thing to change.**
- **Components:** 26 shadcn/ui primitives; signature `CardShell` (gradient card: icon+label header + right-side stat/progress + body), tab-based card inputs, `RecentEntriesList` with inline edit, multi-stage `Progress` coloring (on-budget → extended → over-limit), floating bars, `SwipeNav`.
- **Verified gaps the recreation should close:** no `onMutate` optimistic handlers; `tnum` not globally enabled; `pulsePressureColor` is a binary red threshold; over-budget state hardcoded to alarm-red.

---

*End of brief. Build faithfully on §10; discipline color via the two-axis system in §2.2; test every choice against the North Star in §1.*
