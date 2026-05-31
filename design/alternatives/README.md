# Alternatives — Stage 2 design explorations

Pencil-generated alternative designs that depart from the faithful Stage-1
recreation in `design/screens/`. Each subfolder is one design direction.

## brief-vision/

The design brief's **refined vision** applied — keeping the app's identity but
disciplining it per `docs/design/2026-05-30-intake-tracker-design-brief.md` (§2, §4, §9):

- **Two-axis color** — identity *tint* (which metric, soft wash + saturated icon
  chip only) vs a shared *status scale* (on-track → nearing → **over = amber, not
  alarm-red** → danger = clinical only).
- **Calm over-budget state** — "+150 mg over budget · slightly over", never red.
- **BudgetCard vs ReadingCard** — budgets get rings + pace markers; readings get
  last-value + sparkline, no false progress bar.
- **Two-tier dashboard** — hero water+sodium, then a compact readings grid.
- **Smoothed weight trend** with a directional delta, **tabular-nums**, and
  optimistic **"Logged · Undo"** / calm offline states.

Files:
- `_refined-system.pen` / `.png` — refined design-system board
- `01-dashboard-refined.pen` / `.png` — two-tier refined dashboard
