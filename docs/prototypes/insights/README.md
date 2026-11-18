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
- **Analysis**: every analysis in one place: start a health or food analysis (Quick or
  Deep), read it, and manage past ones (`ai-review.tsx`). No AI runs yet: Quick and Deep
  results are fixed templates filled in on the device from the engine's numbers, Deep
  attaches preselected references instead of searching, and the real AI routes are
  deferred.

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
It has variant 1 only (`#1`); today's window (`0`) needs the app. The result is one HTML
file that opens without the app; making it takes three steps, run from the repo root.

1. **Bundle the entry** into an IIFE. The defines keep the floating bar, which is gated
   on `NODE_ENV` (esbuild sets `production` when minifying):

   ```bash
   mkdir -p out   # build output; do not commit
   apps/web/node_modules/.bin/esbuild \
     apps/web/src/components/analytics/insights-prototype/standalone.tsx \
     --bundle --format=iife --jsx=automatic --minify \
     --tsconfig=apps/web/tsconfig.json \
     --define:process.env.NODE_ENV='"development"' \
     --outfile=out/standalone.js
   ```

   The bundle carries no CSS and mounts into `#proto-root`, so it needs the shell below.

2. **Capture the app's shell** with Playwright from `pnpm dev`, so the window is judged
   in the real chrome and styles. On a phone-sized page (e.g. 390×844) open
   `http://localhost:3000/analytics?variant=1`, wait for `[data-testid=metrics-body]`,
   then in the page:
   - serialise every stylesheet's rules (`document.styleSheets` → `cssRules` →
     `cssText`) into one `<style>`, dropping `@media` rules whose condition has
     `min-width`, so the capture keeps the phone layout at any width;
   - inline each `@font-face` `url(...)` as a `data:` URI (fetch it, base64 it);
   - replace `[data-testid=metrics-body]` with `<div id="proto-root"></div>`;
   - remove every `<script>`, every `<link rel=stylesheet|preload|modulepreload>` and
     the original `<style>` tags (their rules are now in the one `<style>`), and keep the
     `<html>` class and attributes (theme).

   Save `document.documentElement.outerHTML` as `out/shell.html`.

3. **Wrap** the bundle into the capture as an inline script at the end of `<body>`:

   ```bash
   node -e 'const f=require("fs");const s=f.readFileSync("out/shell.html","utf8");
     const js=f.readFileSync("out/standalone.js","utf8").replace(/<\/script/gi,"<\\/script");
     f.writeFileSync("out/metrics-prototype.html",
       "<!doctype html>"+s.replace("</body>",()=>"<script>"+js+"</script></body>"))'
   ```

   `out/metrics-prototype.html` is the shareable file; open it and check that the window
   renders and the bar switches variants.

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
