# Pencil `.pen` Merge Tool

`scripts/pencil/merge-pens.mjs` — a non-destructive tool that combines N per-screen Pencil
`.pen` files into one openable document, without modifying any source file.

## Why this exists

Each CLI-generated screen `.pen` file contains **exactly one** top-level frame, and Pencil
places every one of them at `x:0, y:0`. Naively concatenating their `children[]` arrays would
stack every screen on top of each other at the origin. This tool repositions each frame onto a
non-overlapping grid, unions document-level fields (design tokens etc.), guarantees id
uniqueness, validates the result, and writes a **new** combined file. The per-screen work Pencil
generated is never destroyed.

## File format (verified from real CLI-written files)

A `.pen` file is **plain, pretty-printed JSON** (not encrypted for CLI-written files):

```jsonc
{
  "version": "2.11",
  "children": [ { "type": "frame", "x": 0, "y": 0, "width": 440, ... } ],
  "variables": { "bg-page": { "type": "color", "value": "#F1F5F9" }, ... }  // optional
}
```

- The root may also carry optional `themes` / `imports` / `fonts` objects (none appear in the
  current screens, but the tool unions them if present).
- Top-level objects live on an **infinite 2-D canvas**; each must carry numeric `x`/`y` for its
  top-left corner. Nested children are positioned **relative to their parent** — so during a merge
  only the top-level frame's `x`/`y` ever needs rewriting; descendants stay untouched.
- Element `id`s are short base62 strings and **must be unique within a document**. Components are
  referenced by id via an instance's `ref` field.

## How to run

```bash
# Merge explicit files
node scripts/pencil/merge-pens.mjs --out design/app.pen \
  design/exports/01-dashboard.pen design/exports/02-medications-schedule.pen ...

# Or point it at a directory (expands to the *.pen files directly inside, non-recursively)
node scripts/pencil/merge-pens.mjs --out design/app.pen design/exports/
```

### Options

| Flag            | Default | Meaning |
| --------------- | ------- | ------- |
| `--out <path>`  | —       | **Required.** Output file. Refuses to run if it equals an input. |
| `--cols <n>`    | auto    | Force a fixed column count. Default auto-fits within `--max-w`. |
| `--gap <px>`    | `120`   | Gutter between grid cells. |
| `--max-w <px>`  | `8192`  | Self-imposed canvas width budget (see "The 8K constraint"). |
| `--max-h <px>`  | `8192`  | Self-imposed canvas height budget. |
| `--fallback-h <px>` | `1600` | Height reserved for auto-sized (height-omitted) frames. |
| `--help`        | —       | Print usage. |

The script prints a summary: ordered inputs, the grid geometry, each placed frame's `x/y/w/h`,
the total bounding box vs. the budget, which doc-level fields were merged, and any warnings.

## Coordinate / packing math

Inputs are processed in a **deterministic order** (sorted by basename, then full path) so output
is reproducible regardless of filesystem ordering.

1. **Effective size per frame.**
   - `width` = the frame's numeric `width` (`440` in every sample); falls back to `440` if the
     value is non-numeric (e.g. a `fill_container` string, which should never appear on a top
     frame).
   - `height` = the frame's numeric `height` **if present** (trusted verbatim — it already
     encloses both flow content and absolutely-positioned overlays). If `height` is **omitted**,
     the frame is auto-sized ("hug") and its true rendered height is **not derivable from the
     JSON** (text nodes carry no height; flow children carry no height/y under flex layout). We do
     **not** try to sum child heights — that would undercount and cause overlap. Instead we
     reserve a generous fixed fallback (`--fallback-h`, default `1600` > the tallest explicit
     sample of `956`) and emit a warning.

2. **Column geometry.**
   - `cellWidth` = max effective width across all frames (uniform columns keep the x-math trivial).
   - `stride = cellWidth + gap`.
   - `cols = floor((maxW + gap) / stride)` (or `--cols` if forced).

3. **Column / shelf placement.** Walk a column top-to-bottom: place each frame at the current
   `y`, then advance `y += height + gap`. When the next frame would push past `maxH`, wrap to the
   next column (`x += stride`, `y = 0`). Frames are top-aligned within a column. Because both `x`
   and `y` increase monotonically and cells are rigid AABBs separated by gaps, **overlap is
   impossible by construction** — and an explicit O(n²) overlap assertion guards the output before
   it is written.

4. **Repositioning is the only mutation.** Each source frame subtree is **deep-cloned**; the only
   fields changed on the clone are its own `x` and `y` (and `name`, only if the frame had none).
   `width`, `height`, `children`, and all descendants are preserved exactly.

## Variable / document-field handling

`variables`, `themes`, `imports`, and `fonts` are unioned **key-by-key** with **first-writer-wins**:

- New key → copied in.
- Same key, **deep-equal** value → kept (idempotent; no warning).
- Same key, **different** value → the first source's value is kept and a **warning** names the
  conflicting key and both values. Nothing is silently overwritten, so no screen's appearance
  changes underneath it.

`version` is gated: all inputs should share one version (`2.11`). On a mismatch the tool warns and
keeps the lexicographically greater version.

## Id safety

1. Collect every `id` across all inputs (deterministic order).
2. A frame is merged only **after** earlier frames. If any of its ids collide with an
   already-merged id, that id is **regenerated** (8-char base62, guaranteed unused) **in the cloned
   copy only** — the source file is never touched.
3. When an id is regenerated, every **known reference** to it within that same subtree is rewritten
   to the new id. Known reference fields are: `ref`, `componentId`, `instanceOf`, `targetId`,
   `linkTo`.
4. **Fail-loud safety valve.** If a colliding id also appears as the value of a string field that
   is **not** a known reference field (it could be a coincidental text label, or an
   unknown/undocumented reference mechanism), the tool **refuses to guess** — it aborts with a
   clear error and writes nothing, rather than risk corrupting content or dangling a reference. The
   user must resolve the source collision or extend `REFERENCE_KEYS` in the script.

Regeneration only happens on a **real** collision; ids that don't collide are preserved exactly,
keeping diffs minimal and Pencil-generated ids intact. (The five current screens have zero
cross-file id collisions, so this is purely a guard.)

## The "8K" constraint + fallback

Pencil documents the canvas as **infinite** — there is **no documented maximum dimension**. The
`8192` budget is therefore a **self-imposed tidiness preference**, not a hard format limit. Frames
are **always** placed without overlap. If the batch can't fit inside `maxW × maxH`, the tool keeps
placing them in further columns (coordinates still increase monotonically → still no overlap) and
prints an **overflow warning** per offending frame. It never silently overlaps, never truncates,
and never splits a frame across columns. If a single frame is taller than `maxH`, it is placed
alone in its column and a warning is emitted.

## Validation gate (fail-closed)

Before anything is written, the merged document must pass:

1. **JSON round-trip** (`stringify` → `parse`).
2. **Global id uniqueness** (no duplicate ids anywhere in the output).
3. **No-overlap** assertion over the actual placed boxes.

If any check fails, the tool errors out and writes **nothing**.

## Self-test result

Run against the five real sample screens
(`/tmp/pen-samples/{01-dashboard,02-medications-schedule,07-settings,09-auth-signin,11-help-index}.pen`):

- Produced a valid combined `.pen` (`{ version, children:[5], variables:{12} }`).
- All 5 frames packed into a single column with **zero overlap**.
- 629 ids, **0 duplicates**; `09-auth-signin`'s 12 color variables unioned in cleanly.
- Source files **unchanged** (md5 identical before/after).
- Total bounding box **440 × 7168 px** (within the 8192 budget).
