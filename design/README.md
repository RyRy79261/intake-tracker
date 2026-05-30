# Design — Pencil CLI workflow

This folder holds the app's design recreated with [Pencil](https://pencil.dev)
via its **headless CLI** (`@pencil.dev/cli`). The `.pen` files are the source of
truth; they are edited only through the Pencil CLI / MCP tools (their contents
are encrypted — do not `cat`/`grep` them).

## Layout

```
design/
  intake-tracker.pen     # master canvas — all screens (the deliverable)
  screens/*.pen          # per-screen working files
    _design-system.pen   # tokens, type scale, shared chrome, primitives (the foundation)
  reference/*.png        # real-app screenshots (source of truth for fidelity)
  exports/*.png          # Pencil-rendered exports (the review loop)
  images/                # logos / generated assets
docs/design/2026-05-30-intake-tracker-design-brief.md   # research-grounded brief
scripts/pencil/          # run.sh wrapper + Playwright capture harness
```

## Prerequisites

The CLI is a **global** tool (not a repo dependency), installed once and
authenticated with a stored session:

```bash
npm i -g @pencil.dev/cli      # or: pnpm add -g @pencil.dev/cli
pencil login                  # interactive, one-time
pnpm design:status            # verify: should show ● Active
```

Headless runs reuse the stored session at `~/.pencil/session-cli.json` — no
interactive login per run. For unattended/CI use, set `PENCIL_CLI_KEY`.
Each generation runs a Claude-agent loop (default model Claude Opus) that
designs on the canvas and self-verifies via screenshots — expect ~1–4 min per
screen.

## npm scripts

| Script | Does |
|---|---|
| `pnpm design:capture` | Playwright captures every screen to `design/reference/*.png` (mobile viewport, reuses seeded e2e auth). **Starts the dev server** if one isn't already running. |
| `pnpm design:cli -- <args>` | Passthrough to the `pencil` CLI with the pnpm bin on PATH. |
| `pnpm design:status` | `pencil status` — auth check. |

> `design:capture` auto-starts `pnpm dev`. By project convention Claude does not
> start the dev server; run this command yourself (or start `pnpm dev` first —
> the config reuses an existing server).

## Workflow

1. **Capture** real-app references: `pnpm design:capture` → `design/reference/`.
2. **Brief**: the research-grounded brief in `docs/design/` (codebase tokens +
   health-PWA/mobile/a11y research) grounds every prompt.
3. **Foundation**: build `screens/_design-system.pen` once — tokens, type scale,
   shared chrome (AppHeader, QuickNavFooter, CardShell), core shadcn primitives.
4. **Screens**: for each screen, run the CLI grounded by the foundation, the
   code-derived spec (prompt), and the reference screenshot in `--workspace`:

   ```bash
   pnpm design:cli -- \
     --in design/screens/_design-system.pen \
     --out design/screens/01-dashboard.pen \
     --workspace design/reference \
     --prompt "Recreate the dashboard screen. Use 01-dashboard.png as the visual reference. <spec…>" \
     --export design/exports/01-dashboard.png
   ```

5. **Verify**: compare each `design/exports/*.png` against its
   `design/reference/*.png`; refine via follow-up prompts (`--in` the screen
   file, `--out` itself).
6. **Assemble**: curate the finished screens onto `design/intake-tracker.pen`.

## Regenerating one screen

```bash
pnpm design:cli -- \
  --in design/screens/07-settings.pen \
  --out design/screens/07-settings.pen \
  --workspace design/reference \
  --prompt "Tighten the accordion spacing to match 07-settings.png" \
  --export design/exports/07-settings.png
```

## Git policy

Commit `.pen` files, the brief, this README, the scripts, `design/reference/`,
and a curated set of `design/exports/`. Work-in-progress renders
(`*-wip-*.png`) and CLI temp dirs are gitignored.
