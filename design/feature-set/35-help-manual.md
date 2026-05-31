# 35 — Help / User Manual

**Files covered:**
- `src/lib/help/manuals.ts` — content model + all manual data (domains, manuals, callouts)
- `src/lib/help/preview-data.ts` — sample-data seed functions for live previews
- `src/app/help/page.tsx` — `/help` index route
- `src/app/help/[slug]/page.tsx` — `/help/<slug>` article route (with not-found fallback)
- `src/components/help/help-index.tsx` — domain-grouped index list
- `src/components/help/manual-view.tsx` — single-article renderer
- `src/components/help/manual-callout.tsx` — tinted callout aside (tip/note/warning/privacy)
- `src/components/help/help-top-bar.tsx` — sticky back-bar for help pages
- `src/components/help/component-preview.tsx` — isolated live-component preview harness
- `src/components/help/preview-registry.tsx` — slug→(component, seed) preview registry
- `src/components/settings/help-section.tsx` — "Open the manual" entry point in Settings
- `src/components/report-bug-dialog.tsx` (lines ~359–382) — "Wanna read the manual?" entry point in shake/bug dialog
- `src/lib/db.ts` (lines ~448–457, ~913–947) — `db` live binding + `createPreviewDatabase` / `setActiveDatabase` / `resetActiveDatabase` / `PREVIEW_STORES`
- `src/components/help/component-preview.dom.test.tsx` — DOM test proving the preview seam

**Purpose:** An in-app, offline-first user manual that documents every card, input and feature of the app as a set of structured guides grouped by domain, rendered as illustrated articles with numbered steps, bullets and tinted callouts, and — for six manuals — an embedded, fully-interactive **live preview** of the real app component running against a throwaway, fixture-seeded database. Content is plain structured data (no markdown engine), so new manuals are added by editing one data file.

---

## Features

- **Manual index (`/help`)** — lists every manual grouped under its domain. Each domain shows an icon, a label, a one-line blurb, then its manuals as tappable cards (icon tile + title + summary + chevron). Empty domains are hidden automatically.
- **Domain grouping** — seven domains (getting-started, intake, health, medications, voice, ai, system) provide section headers with their own colour token and icon.
- **Single-article view (`/help/<slug>`)** — header (icon + title + summary + "Where to find it" pill), an optional live preview block, then an ordered list of content sections.
- **Structured content model** — each manual is data: `slug`, `title`, `domain`, `icon`, `summary`, `whereToFind`, and an array of `sections`. Each section can carry intro `body` prose (paragraph-split on blank lines), numbered `steps`, a bullet list, and/or a single tinted `callout`. No markdown parser — rendering walks the structure.
- **Callouts** — four tones (tip / note / warning / privacy) each with its own icon, label text, border/background tint (light + dark variants) and accent colour. Used for tips, cross-references, AI/privacy disclaimers and medical warnings.
- **Embedded live component previews** — six manuals render the *real* app component (e.g. `BloodPressureCard`, `LiquidsCard`) inside a "Try it" block. The component is fully interactive but reads/writes an isolated throwaway IndexedDB seeded with sample rows; nothing touches the user's real data. Includes a Reset control to re-seed.
- **Preview isolation seam** — `ComponentPreview` swaps the module-level `db` live binding to a fresh `createPreviewDatabase()`, suspends the sync engine, seeds fixtures, then on unmount resets the binding, resumes the engine and deletes the preview DB. Each preview gets a unique DB name (`IntakeTrackerPreviewDB-<counter>`).
- **"Where to find it" pointer** — every manual states where the feature physically lives in the app (e.g. "Home screen → Water & drinks card", "Settings → AI features").
- **Cross-references** — manuals reference each other by name in prose/callouts (e.g. food manual points to the AI manual; voice manual points to Privacy).
- **Sticky top bar with back** — help pages render their own `HelpTopBar` (the global AppHeader hides on non-top-level routes); back uses `router.back()`.
- **Two entry points outside Settings** — (1) Settings → "User manual" section ("Open the manual" button); (2) the shake / bug-report dialog's "Wanna read the manual?" panel ("Open the manual" button, which closes the dialog first).
- **Not-found handling** — an unknown `/help/<slug>` renders a centered "That manual could not be found." message and a "Back to the manual" button routing to `/help`.
- **Helper API** — `getManual(slug)`, `getManualsByDomain()` (domain→manuals, empty groups filtered), `getManualPreview(slug)`, `HELP_INDEX_ICON` (BookOpen).

---

## User actions & interactions

**Index page (`/help`):**
- Tap a manual card → navigates to `/help/<slug>` (Next `<Link>`).
- Tap the back arrow in the top bar → `router.back()`.
- Hover a card → background changes to `accent` (hover state).

**Article page (`/help/<slug>`):**
- Tap back arrow → `router.back()`.
- Read sections: prose, numbered steps (numbered pill 1..n), bullet lists, callouts — static, no interaction except the preview.
- **Live preview (when present):**
  - Tap/type/interact with the embedded real component (e.g. tap the BP card's add button, type a drink name) — it behaves exactly as in the app but against sample data.
  - Tap **Reset** (top-right of the preview frame, RotateCcw icon) → re-creates and re-seeds the preview database, remounts the component with fresh sample data (increments an internal `generation` counter, drops back to loading then ready).
  - Any writes the user makes inside the preview are discarded on unmount (preview DB deleted).

**Entry points:**
- Settings → "User manual" → tap **Open the manual** → `router.push("/help")`.
- Shake / bug-report dialog → "Wanna read the manual?" → tap **Open the manual** → closes the dialog (`onOpenChange(false)`) then `router.push("/help")`.

**Not-found:**
- Tap **Back to the manual** → `router.push("/help")`.

---

## States & presentations

**Index list:**
- **Default** — domains in fixed order, each with its colour-tokened icon + label + blurb, manuals as bordered `bg-card` cards.
- **Hover** — card background → `accent`.
- **Empty domain** — hidden entirely (group filtered out by `getManualsByDomain`).
- (No loading/error/offline states — content is static, bundled; renders instantly offline.)

**Article view:**
- **Default** — header pill ("Where to find it"), sections list.
- **Has-preview vs no-preview** — manuals registered in `MANUAL_PREVIEWS` show a "Try it" section above the prose; others omit it entirely.
- **Section variants** — a section may show any combination of body prose, numbered steps, bullets, callout; spacing adjusts (`mt-3`) when a body precedes steps/bullets.
- **Not found** — centered fallback message + button.

**Live preview (`ComponentPreview`) — four runtime states:**
- **loading** — `Loader2` spinner + "Preparing preview…" (while opening + seeding the preview DB).
- **ready** — the real component rendered inside an isolated `QueryClientProvider` (retry off, `gcTime: 0`, mutation retry off).
- **error** — "The preview could not be loaded." (open/seed threw).
- **reset transition** — Reset sets status back to loading and bumps `generation`, re-running the effect.
- Frame chrome (all states): header bar with FlaskConical icon + caption "Live preview · sample data · changes are not saved" and the Reset button.

**Callout states (per tone):**
- **tip** — Lightbulb, label "Tip", emerald border/bg, emerald accent.
- **note** — Info, label "Note", sky border/bg, sky accent.
- **warning** — AlertTriangle, label "Important", amber border/bg, amber accent.
- **privacy** — ShieldCheck, label "Privacy", violet border/bg, violet accent.
- Each has explicit light and dark (`dark:`) variants.

**Theme:** every colour token has a `dark:` counterpart (domain icon colours, callout tints, top-bar gradient `from-slate-50` / `dark:from-slate-950`).

---

## Enums, options & configurable values

**`ManualDomainId` (7 values):** `"getting-started" | "intake" | "health" | "medications" | "voice" | "ai" | "system"`.

**`CalloutTone` (4 values):** `"tip" | "note" | "warning" | "privacy"`.

**Domains (`MANUAL_DOMAINS`, in render order)** — id · label · blurb · icon · colorClass:
| id | label | blurb | icon | colorClass |
|---|---|---|---|---|
| getting-started | "Getting started" | "New here? Start with the big picture." | Compass | `text-sky-600 dark:text-sky-400` |
| intake | "Food & drink" | "Logging what you drink and eat." | Droplets | `text-blue-600 dark:text-blue-400` |
| health | "Health metrics" | "Vitals and body measurements." | HeartPulse | `text-indigo-600 dark:text-indigo-400` |
| medications | "Medications" | "Prescriptions, doses and titrations." | Pill | `text-teal-600 dark:text-teal-400` |
| voice | "Voice" | "Hands-free logging." | Mic | `text-violet-600 dark:text-violet-400` |
| ai | "AI & privacy" | "Optional smart helpers and your data." | Sparkles | `text-amber-600 dark:text-amber-400` |
| system | "App & settings" | "Configuring the app." | SlidersHorizontal | `text-slate-600 dark:text-slate-400` |

**Manuals (`MANUALS`, 14 total)** — slug · title · domain · icon · has-live-preview:
| slug | title | domain | icon | preview |
|---|---|---|---|---|
| how-it-works | "How Intake Tracker works" | getting-started | Compass | yes (`TextMetrics`) |
| logging-drinks | "Logging water & drinks" | intake | CupSoda | yes (`LiquidsCard`) |
| food-and-sodium | "Tracking food, sodium & sugar" | intake | Salad | yes (`FoodSaltCard`) |
| blood-pressure | "The blood pressure card" | health | Activity | yes (`BloodPressureCard`) |
| weight | "The weight card" | health | Scale | yes (`WeightCard`) |
| urination-and-bowel | "Urination & bowel movements" | health | Bath | yes (`UrinationCard` + `DefecationCard`) |
| editing-entries | "Editing & correcting entries" | intake | Pencil | no |
| adding-medication | "Adding a medication" | medications | PlusCircle | no |
| medication-schedule | "Your medication schedule & doses" | medications | CalendarClock | no |
| voice-operator | "The voice operator" | voice | Mic | no |
| ai-features | "AI features & API keys" | ai | Sparkles | no |
| privacy | "Privacy & your data" | ai | ShieldCheck | no |
| settings | "Settings & customization" | system | SlidersHorizontal | no |

(Note: the manuals reference but do not separately list a substances/caffeine manual — substances surface inside `how-it-works` via the `TextMetrics` preview only.)

**Callout tone presentation map (`TONE` in manual-callout.tsx)** — tone → icon · label:
- tip → Lightbulb · "Tip"
- note → Info · "Note"
- warning → AlertTriangle · "Important" (label differs from tone id)
- privacy → ShieldCheck · "Privacy"

**Manual-section optional fields:** `heading` (required) + any of `body`, `steps[]`, `bullets[]`, `callout`.

**Live-preview registry (`MANUAL_PREVIEWS`, 6 entries):** keyed by slug → `{ render, seed }`. Slugs with previews: how-it-works, logging-drinks, food-and-sodium, blood-pressure, weight, urination-and-bowel.

**Preview seed fixtures (actual sample values, from preview-data.ts):**
- `seedBloodPressurePreview` — 3 readings: 118/76 hr68 sitting/left (−1d), 124/81 hr72 sitting/left (−3d), 131/84 hr77 standing/right (−6d).
- `seedWeightPreview` — 3 weights: 74.6 (−1d), 74.9 (−4d), 75.4 (−8d).
- `seedLiquidsPreview` — 3 water intakes: 250ml (−1h), 200ml (−3h), 300ml (−6h), source "manual".
- `seedFoodSaltPreview` — 2 salt intakes: 400 ("Lunch", −2h), 250 ("Breakfast", −5h).
- `seedBathroomPreview` — urination: medium (−1h), large (−4h), small note "pale" (−8h); defecation: medium note "normal" (−5h), small (−1d−4h).
- `seedTextMetricsPreview` — water 500/300, salt 600, plus a caffeine substance (95 mg / 250 ml, "Coffee", source "standalone", aiEnriched false).
- Time constants: `DAY_MS = 86_400_000`, `HOUR_MS = 3_600_000`.

**Captions / copy (verbatim):**
- Index subtitle: "Short guides for every card, input and feature in Intake Tracker. Pick the thing you want to learn about."
- Top-bar title (both index + article): "User Manual".
- Preview block heading: "Try it"; body: "This is the real component, loaded with sample data. Tap and type — it works exactly as it does in the app, and nothing you do here is saved."
- Preview frame caption: "Live preview · sample data · changes are not saved"; reset label: "Reset".
- Loading: "Preparing preview…"; error: "The preview could not be loaded."
- Not-found: "That manual could not be found." / button "Back to the manual".

**React Query config inside preview:** `queries: { retry: false, gcTime: 0 }`, `mutations: { retry: false }`.

---

## Data model touched

The help feature itself stores **nothing** — manuals and domains are static TypeScript data (`MANUALS`, `MANUAL_DOMAINS` in `manuals.ts`). It does not read or write the user's real DB.

**Live-preview reads/writes (isolated preview DB only, never the real DB):**
- `IntakeRecord` (intakeRecords) — fields used: `id, type, amount, timestamp, source, note` + `syncFields()` (water/salt/sugar entries).
- `BloodPressureRecord` (bloodPressureRecords) — `systolic, diastolic, heartRate, position, arm, timestamp`.
- `WeightRecord` (weightRecords) — `weight, timestamp`.
- `UrinationRecord` (urinationRecords) — `amountEstimate ("small"|"medium"|"large"), note, timestamp`.
- `DefecationRecord` (defecationRecords) — `amountEstimate, note, timestamp`.
- `SubstanceRecord` (substanceRecords) — `type ("caffeine"), amountMg, volumeMl, description, source ("standalone"), aiEnriched, timestamp`.
- All seeds use `generateId()` + `syncFields()` from `@/lib/utils`.

**DB plumbing (db.ts):**
- `db` — module-level `AppDatabase` live binding, defaults to `realDb` (Dexie `IntakeTrackerDB`).
- `createPreviewDatabase()` — new Dexie named `IntakeTrackerPreviewDB-<counter>`, schema `DB_SCHEMA_VERSION` with `PREVIEW_STORES`.
- `setActiveDatabase(next)` / `resetActiveDatabase()` — swap/restore the `db` binding; every `import { db }` consumer follows automatically.

**Sync engine:** `suspendEngine()` on preview mount, `resumeEngine()` on unmount (from `@/lib/sync-engine`) — keeps preview writes out of the sync queue.

---

## Validation, edge cases & business rules

- **No markdown engine.** Content is structured data; `body` is split into paragraphs on a blank line (`\n\n`). Inline emphasis/links in prose are plain text only.
- **Empty domains filtered.** `getManualsByDomain()` omits any domain with zero manuals, so the index never shows an empty header.
- **Unknown slug.** `getManual()` returns `undefined`; the route renders the not-found fallback (does not throw / 404 page).
- **Preview isolation guarantees:**
  - Active DB is swapped *before* seeding and restored on cleanup; a `cancelled` flag guards async state updates after unmount.
  - Sync engine suspended for the preview lifetime so no preview rows enter the sync queue.
  - Preview DB is `delete()`-d on unmount; counter ensures a unique DB name per instance (avoids collisions across remounts/navigation).
  - `QueryClient` is created once per `ComponentPreview` (ref-guarded) with retries off and `gcTime: 0` so stale preview data isn't cached.
  - `<div key={generation}>` forces a full remount of the previewed component on Reset.
  - `<ComponentPreview key={manual.slug}>` in ManualView forces a fresh harness per article.
- **Top-bar rationale:** global AppHeader hides on non-top-level routes, so each help page supplies its own sticky bar; back uses `router.back()` (returns to wherever the user came from, not hard-coded to `/help`).
- **Bug-dialog entry point** closes the dialog before navigating (avoids a stuck modal over the manual).
- **AI/privacy disclaimers** are encoded as callouts (note/privacy tones) repeatedly across manuals (food sparkle, voice, ai-features, privacy) — copy states PII (emails, phone numbers, ID-like numbers) is stripped before any AI call and AI features only appear once a key is configured.
- **Test contract** (`component-preview.dom.test.tsx`): asserts the seam end-to-end — seeded `118/76` appears for the BP preview, `250ml` for drinks, `pale`/`normal` for bathroom — proving the active-DB swap and real-hook reads work. The test mocks `useAuthGate` to `true` so `LiquidsCard`'s preset (AI) tab renders.

---

## Sub-components / variants

- `src/app/help/page.tsx` — `/help` route; renders `<HelpIndex />`.
- `src/app/help/[slug]/page.tsx` — `/help/<slug>` route; resolves slug → manual, renders `<ManualView>` or not-found fallback.
- `HelpIndex` (`help-index.tsx`) — domain-grouped list of manual cards with chevrons; top bar + subtitle.
- `ManualView` (`manual-view.tsx`) — article renderer: header pill, optional "Try it" preview, sections (body/steps/bullets/callout).
- `HelpTopBar` (`help-top-bar.tsx`) — sticky gradient bar with back button + title, used by both index and article.
- `ManualCallout` (`manual-callout.tsx`) — tinted aside; resolves tone → icon/label/colours.
- `ComponentPreview` (`component-preview.tsx`) — isolated, seeded, interactive live-component harness with loading/ready/error + Reset.
- `getManualPreview` / `MANUAL_PREVIEWS` (`preview-registry.tsx`) — slug → `{ render, seed }` registry of real components to preview.
- `HelpSection` (`settings/help-section.tsx`) — Settings entry point ("User manual" → Open the manual).
- Report-bug dialog manual panel (`report-bug-dialog.tsx`) — secondary entry point ("Wanna read the manual?").
- `manuals.ts` exports — `MANUAL_DOMAINS`, `MANUALS`, `getManual`, `getManualsByDomain`, `HELP_INDEX_ICON`, and the `Manual` / `ManualDomain` / `ManualSection` / `Callout` / `CalloutTone` / `ManualDomainId` types.
- `preview-data.ts` exports — `seedBloodPressurePreview`, `seedWeightPreview`, `seedLiquidsPreview`, `seedFoodSaltPreview`, `seedBathroomPreview`, `seedTextMetricsPreview`.
- db.ts helpers — `createPreviewDatabase`, `setActiveDatabase`, `resetActiveDatabase`, `db` live binding, `PREVIEW_STORES`.
