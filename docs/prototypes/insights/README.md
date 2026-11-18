# PROTOTYPE: Metrics insights redesign

Question: what should the Metrics insights show so they are useful beyond averages?

Built with the `prototype` skill (`.claude/skills/prototype`, UI branch, sub-shape A) on
the existing Metrics window. It renders only in development and on Vercel preview
deployments (`PROTOTYPES_ENABLED`); a production build shows today's Metrics window
whatever the query string says.

## Current prototype (round 4)

The whole Metrics window as a doctor-style report, in one layout:

| Key | Variant | Tabs |
|---|---|---|
| 1 | Analysis tab (default) | Report · Vitals · Fluid · Food · Meds · Analysis |
| 0 | Current Metrics | today's window, in the app only |

- **Report**: the fixed printable one-pager (home BP format, % days within limits,
  adherence, medicine changes, symptom context, questions for the appointment).
- **Vitals, Fluid, Food, Meds**: one chapter each, every block covering the period picked
  in the range selector and stating how many days or readings it rests on. Meds holds a
  before/after card per medicine change in the period.
- **Analysis**: every AI analysis in one place: start a health or food analysis (Quick or
  Deep), read it, and manage past ones (`ai-review.tsx`).

Open the Metrics window with `?variant=1` (or `?variant=0` for today's window), e.g.
`/analytics?variant=1`, and switch with ← / → or the floating bar. Opening History's
Records hands over to today's window.

- Layout: `apps/web/src/components/analytics/insights-prototype/metrics-prototype.tsx`
  (tabs), `chapters.tsx` (Vitals, Fluid, Food, Meds), `variant-report.tsx` (Report),
  `ai-review.tsx` (Analysis); `index.tsx` mounts it with the switcher.
- Engine (pure, liftable): `apps/web/src/components/analytics/insights-prototype/engine.ts`
- Data read (read-only Dexie): `apps/web/src/hooks/use-insights-prototype.ts`
- Research behind it: `02-clinical-metrics.md`, `03-methods-and-ux.md`. A third report
  (data inventory) used real logged data and is deliberately not committed.

Not validated: the agents' guideline citations marked [K] came from memory, not a fetched source.

## Hosted build

`apps/web/src/components/analytics/insights-prototype/standalone.tsx` renders the same
engine and window on generated example data, so nobody's health records leave the device.
Bundle it into one HTML file with esbuild (`--bundle --format=iife --jsx=automatic
--tsconfig=apps/web/tsconfig.json`) to share it without running the app. It has variant
1 only (`#1`); today's window (`0`) needs the app.

## History

Earlier rounds are in this branch's history; their code is no longer in the tree.

- **Round 1** (historical): three variants on the Summary tab. A "What changed" (last 7
  days vs the previous 28), B "Timeline" (every measure on one 60-day axis, medicine
  changes as lines), C "Doctor report" (fixed printable one-pager). Verdict: C won, and
  the redesign had to cover the whole Metrics window, not just Summary.
- **Round 2** (historical): the whole window in that style, three ways to organise it. A
  Chapters (Report · Vitals · Intake · Meds · Journal · Records), B One document (one long
  page with a jump index), C Visit pack (period runs from the last appointment). Summary,
  Correlations and Titration are replaced: fixed questions with lags replace the
  correlation picker, and a before/after card per medicine change replaces the Titration
  tab. The range selector sets the period every block reports on.
- **Round 3** (historical): layout A kept, with Food as its own chapter, report export,
  and Claude's quick and deep review woven through the report, then three compact
  treatments for the AI analysis.
- **Round 4** (current): the AI analyses move into the single Analysis tab above. Records
  leaves the prototype (it moves to History in the build).
