# PROTOTYPE: Metrics insights redesign

Question: what should the Metrics insights show so they are useful beyond averages?

Built with the `prototype` skill (`.claude/skills/prototype`, UI branch, sub-shape A):
three variants on the existing Summary tab, switchable with `?variant=` and a
floating bar (dev and Vercel preview only, never production).

| Key | Variant | Idea |
|---|---|---|
| A | What changed | Last 7 days vs your previous 28; only what moved, then events, then a fixed list of questions about your data |
| B | Timeline | Every measure on one 60-day axis, med changes as lines, journal pins; before/after card per med change |
| C | Doctor report | Fixed printable one-pager (home BP format, % days within limits, adherence, symptom context) |
| 0 | Current summary | Today's Summary tab, for comparison |

Open the Metrics window (`/analytics?tab=summary&variant=A`) and use ← / → or the bar.

- Engine (pure, liftable): `apps/web/src/components/analytics/insights-prototype/engine.ts`
- Data read (read-only Dexie): `apps/web/src/hooks/use-insights-prototype.ts`
- Research behind it: `02-clinical-metrics.md`, `03-methods-and-ux.md`. A third report
  (data inventory) used real logged data and is deliberately not committed.

Not validated: the agents' guideline citations marked [K] came from memory, not a fetched source.
