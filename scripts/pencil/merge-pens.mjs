#!/usr/bin/env node
// @ts-check
/**
 * merge-pens.mjs — Non-destructive merge of N Pencil `.pen` files into one combined document.
 *
 * A `.pen` file is plain pretty-printed JSON of the shape:
 *   { "version": "2.11", "children": [ <oneTopLevelFrame> ], "variables"?: {...}, ... }
 * Every CLI-generated screen places its single top-level frame at x:0, y:0 — so naively
 * concatenating children[] overlaps every screen at the origin. This tool repositions each
 * frame onto a non-overlapping grid, unions document-level fields (variables / fonts / imports),
 * guarantees id uniqueness, validates the result, and writes a NEW combined file.
 *
 * NON-DESTRUCTIVE GUARANTEE:
 *   - Inputs are opened READ-ONLY. They are never written to or modified.
 *   - The only mutation applied to any frame is its OWN top-level x/y (on a deep clone).
 *     Frame width/height/children and every nested descendant are preserved byte-for-byte.
 *   - The script refuses to run if --out collides with any input path.
 *
 * USAGE:
 *   node scripts/pencil/merge-pens.mjs --out design/app.pen <in1.pen> <in2.pen> ...
 *   node scripts/pencil/merge-pens.mjs --out design/app.pen <dir-containing-pens>/
 *   node scripts/pencil/merge-pens.mjs --out design/app.pen ./design/exports
 *
 *   Inputs may be individual .pen files and/or directories (each directory is expanded to the
 *   *.pen files it directly contains, non-recursively). Inputs are processed in a deterministic
 *   order: sorted by basename, then by full path.
 *
 * OPTIONS:
 *   --out <path>        Output file path (REQUIRED). Must not equal any input.
 *   --cols <n>          Force a fixed column count. Default: auto-fit within MAX_W.
 *   --gap <px>          Gutter between cells (default 120).
 *   --max-w <px>        Self-imposed canvas width budget (default 8192). See note below.
 *   --max-h <px>        Self-imposed canvas height budget (default 8192).
 *   --fallback-h <px>   Height reserved for auto-sized (height-omitted) frames (default 1600).
 *   --help              Print usage and exit.
 *
 * THE "8K" CONSTRAINT:
 *   Pencil documents an *infinite* canvas — there is NO documented max dimension. The 8192 budget
 *   is therefore a self-imposed tidiness preference, not a hard format limit. Frames are ALWAYS
 *   placed without overlap; if the batch can't fit inside MAX_W x MAX_H, the tool keeps placing
 *   (monotonically increasing coordinates => still no overlap) and prints a WARNING rather than
 *   silently overlapping or truncating. The user's hard requirement (no destroyed work, no
 *   overlap) is always honored; the canvas budget only governs the wrap-vs-warn behavior.
 *
 * AUTO-SIZED FRAME HEIGHTS:
 *   Frames that omit `height` are auto-sized ("hug") by Pencil's flex layout engine and their
 *   true rendered height is NOT derivable from the JSON (text nodes carry no height). BUT each
 *   screen is exported to a PNG (`pencil --export`, scale 1), whose pixel height equals the real
 *   rendered frame height. So for a height-omitted frame we read its co-located export PNG and use
 *   pngHeight * (frameWidth / pngWidth) as the true height (normalizes any export scale). The PNG
 *   is looked up as <stem>.png next to the .pen, or in the dir given by --exports. Only if NO PNG
 *   is found do we reserve a fixed fallback (FALLBACK_H) and WARN — never sum child heights.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, basename, dirname, extname, join } from "node:path";

// ---------------------------------------------------------------------------
// Tunable defaults (all overridable via CLI flags).
// ---------------------------------------------------------------------------
const DEFAULTS = {
  GAP: 120,          // gutter between grid cells (px)
  MAX_W: 8192,       // self-imposed canvas width budget (px) — see header note
  MAX_H: 8192,       // self-imposed canvas height budget (px)
  DEFAULT_W: 440,    // width fallback when a top frame's width is non-numeric
  FALLBACK_H: 1600,  // height reserved for auto-sized (height-omitted) frames
};

const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; // base62, no "/"

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ out: string|null, inputs: string[], cols: number|null, gap: number, maxW: number, maxH: number, fallbackH: number, help: boolean }} */
  const opts = {
    out: null,
    inputs: [],
    cols: null,
    gap: DEFAULTS.GAP,
    maxW: DEFAULTS.MAX_W,
    maxH: DEFAULTS.MAX_H,
    fallbackH: DEFAULTS.FALLBACK_H,
    exportsDir: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--out":
        opts.out = argv[++i];
        break;
      case "--cols":
        opts.cols = mustPositiveInt(argv[++i], "--cols");
        break;
      case "--gap":
        opts.gap = mustNonNegInt(argv[++i], "--gap");
        break;
      case "--max-w":
        opts.maxW = mustPositiveInt(argv[++i], "--max-w");
        break;
      case "--max-h":
        opts.maxH = mustPositiveInt(argv[++i], "--max-h");
        break;
      case "--fallback-h":
        opts.fallbackH = mustPositiveInt(argv[++i], "--fallback-h");
        break;
      case "--exports":
        opts.exportsDir = argv[++i];
        break;
      default:
        if (a.startsWith("--")) die(`Unknown flag: ${a}`);
        opts.inputs.push(a);
    }
  }
  return opts;
}

function mustPositiveInt(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) die(`${flag} expects a positive number, got: ${v}`);
  return n;
}
function mustNonNegInt(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) die(`${flag} expects a non-negative number, got: ${v}`);
  return n;
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const USAGE = `
merge-pens.mjs — non-destructive merge of Pencil .pen screens into one document.

USAGE:
  node scripts/pencil/merge-pens.mjs --out design/app.pen <in1.pen|dir> [<in2.pen|dir> ...]

OPTIONS:
  --out <path>        Output file (REQUIRED). Must not equal any input.
  --cols <n>          Force fixed column count (default: auto-fit within --max-w).
  --gap <px>          Gutter between cells (default ${DEFAULTS.GAP}).
  --max-w <px>        Canvas width budget (default ${DEFAULTS.MAX_W}).
  --max-h <px>        Canvas height budget (default ${DEFAULTS.MAX_H}).
  --fallback-h <px>   Height for auto-sized frames with NO export PNG (default ${DEFAULTS.FALLBACK_H}).
  --exports <dir>     Dir to find each screen's export PNG (<stem>.png) for exact heights.
                      Defaults to looking next to each .pen file.
  --help              Show this help.
`.trim();

// ---------------------------------------------------------------------------
// Input resolution (files + directories of .pen files)
// ---------------------------------------------------------------------------

/**
 * Expand the raw input list into a deterministic, de-duplicated list of .pen file paths.
 * Directories are expanded (non-recursively) to their direct *.pen children.
 * @param {string[]} rawInputs
 * @returns {string[]} absolute file paths
 */
function resolveInputFiles(rawInputs) {
  /** @type {Set<string>} */
  const files = new Set();
  for (const raw of rawInputs) {
    const abs = resolve(raw);
    let st;
    try {
      st = statSync(abs);
    } catch {
      die(`Input not found: ${raw}`);
    }
    if (st.isDirectory()) {
      const entries = readdirSync(abs)
        .filter((f) => extname(f).toLowerCase() === ".pen")
        .map((f) => join(abs, f));
      if (entries.length === 0) die(`Directory contains no .pen files: ${raw}`);
      for (const e of entries) files.add(e);
    } else if (st.isFile()) {
      files.add(abs);
    } else {
      die(`Input is neither a file nor a directory: ${raw}`);
    }
  }
  // Deterministic order: by basename, then by full path (stable, reproducible output).
  return [...files].sort((a, b) => {
    const ba = basename(a);
    const bb = basename(b);
    if (ba < bb) return -1;
    if (ba > bb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Geometry: effective width/height of a top-level frame
// ---------------------------------------------------------------------------

/**
 * Effective width of a top-level frame for packing.
 * Top frames are numeric (440 in all samples); guard against non-numeric (e.g. 'fill_container').
 */
function effectiveWidth(frame) {
  return typeof frame.width === "number" && frame.width > 0 ? frame.width : DEFAULTS.DEFAULT_W;
}

/**
 * Read a PNG's pixel dimensions from its IHDR header (offset 16 = width, 20 = height, BE).
 * @returns {{ w:number, h:number }|null}
 */
function readPngSize(pngPath) {
  let buf;
  try {
    buf = readFileSync(pngPath);
  } catch {
    return null;
  }
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    return null;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * Locate the export PNG for a screen: <exportsDir>/<stem>.png if given, else <pen-dir>/<stem>.png.
 * @returns {string|null}
 */
function candidatePng(penFile, stem, exportsDir) {
  const cands = [];
  if (exportsDir) cands.push(join(resolve(exportsDir), `${stem}.png`));
  cands.push(join(dirname(penFile), `${stem}.png`));
  for (const c of cands) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not there */
    }
  }
  return null;
}

/**
 * Effective height of a top-level frame for packing.
 *   1. Explicit numeric `height` → trust it verbatim.
 *   2. Else, if an export PNG exists → pngHeight * (frameWidth / pngWidth) (exact rendered height,
 *      scale-normalized). This is how tall auto-sized pages (dashboard etc.) get their real height.
 *   3. Else → fixed fallback (caller WARNs). We never sum child heights.
 * @returns {{ h: number, estimated: boolean, source: string }}
 */
function effectiveHeight(frame, fallbackH, pngPath, width) {
  if (typeof frame.height === "number" && frame.height > 0) {
    return { h: frame.height, estimated: false, source: "frame.height" };
  }
  if (pngPath) {
    const sz = readPngSize(pngPath);
    if (sz) {
      const h = Math.round(sz.h * (width / sz.w));
      return { h, estimated: false, source: `export-png(${basename(pngPath)})` };
    }
  }
  return { h: fallbackH, estimated: true, source: "fallback" };
}

// ---------------------------------------------------------------------------
// Deep clone (structuredClone is available in modern Node; fall back to JSON)
// ---------------------------------------------------------------------------
function deepClone(v) {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// Id collection / reference rewriting
// ---------------------------------------------------------------------------

/**
 * Walk a node tree and collect every `id` string into the given Set.
 */
function collectIds(node, out) {
  if (Array.isArray(node)) {
    for (const x of node) collectIds(x, out);
    return;
  }
  if (node && typeof node === "object") {
    if (typeof node.id === "string") out.add(node.id);
    for (const k of Object.keys(node)) collectIds(node[k], out);
  }
}

/**
 * Generate a fresh id not present in `used` (mutates `used` by adding it).
 * Uses base62, length 8 to make re-collision effectively impossible. Never contains '/'.
 */
function generateId(used) {
  for (let attempt = 0; attempt < 10000; attempt++) {
    let id = "";
    for (let i = 0; i < 8; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  die("Exhausted id-generation attempts — keyspace appears saturated.");
}

/**
 * Within a single source subtree (already cloned), rename every node whose id is in
 * `idMap` (old -> new), AND every string-valued field whose value equals an old id
 * (this catches the documented `ref` field and any other id-valued reference field).
 *
 * IMPORTANT SAFETY: a string value could legitimately equal an id by coincidence (e.g. a text
 * label that happens to be a 5-char base62 string). To avoid silently corrupting content, we
 * ONLY rewrite a string value when its KEY is in REFERENCE_KEYS (known reference fields) OR it is
 * the node's own `id`. Any *other* string field that matches a remapped id is reported as a
 * possible unknown reference and causes a LOUD FAILURE — the user must not lose work to a guess.
 */
const REFERENCE_KEYS = new Set(["ref", "componentId", "instanceOf", "targetId", "linkTo"]);

/**
 * @param {any} node
 * @param {Map<string,string>} idMap  old id -> new id (only ids being remapped in THIS subtree)
 * @param {{ unknownRefs: Array<{key:string, value:string}> }} report
 */
function rewriteSubtreeIds(node, idMap, report) {
  if (Array.isArray(node)) {
    for (const x of node) rewriteSubtreeIds(x, idMap, report);
    return;
  }
  if (node && typeof node === "object") {
    // 1) Rename this node's own id if remapped.
    if (typeof node.id === "string" && idMap.has(node.id)) {
      node.id = idMap.get(node.id);
    }
    // 2) Rewrite known reference fields that point at a remapped id.
    for (const k of Object.keys(node)) {
      const val = node[k];
      if (typeof val === "string" && idMap.has(val)) {
        if (k === "id") {
          // already handled above
        } else if (REFERENCE_KEYS.has(k)) {
          node[k] = idMap.get(val);
        } else {
          // A non-reference string field equals a remapped id. This may be an unknown
          // reference mechanism we don't model. Record it; the caller fails loudly.
          report.unknownRefs.push({ key: k, value: val });
        }
      }
    }
    // 3) Recurse.
    for (const k of Object.keys(node)) rewriteSubtreeIds(node[k], idMap, report);
  }
}

// ---------------------------------------------------------------------------
// Document-level field union (variables / fonts / imports)
// ---------------------------------------------------------------------------

/**
 * Merge a keyed object document field across sources with first-writer-wins on conflict.
 * @param {Array<{ name:string, doc:any }>} units  in deterministic order
 * @param {string} field
 * @param {string[]} warnings
 * @returns {Record<string,any>|null}  merged object, or null if no source had the field
 */
function unionKeyedField(units, field, warnings) {
  /** @type {Record<string, any>} */
  const merged = {};
  /** @type {Record<string, string>} */
  const owner = {}; // key -> source name that first defined it
  let any = false;
  for (const u of units) {
    const obj = u.doc[field];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    any = true;
    for (const [key, def] of Object.entries(obj)) {
      if (!(key in merged)) {
        merged[key] = def;
        owner[key] = u.name;
      } else {
        const same = JSON.stringify(merged[key]) === JSON.stringify(def);
        if (!same) {
          warnings.push(
            `${field} collision on key "${key}": keeping value from "${owner[key]}" ` +
              `(${JSON.stringify(merged[key])}); ignoring differing value from "${u.name}" ` +
              `(${JSON.stringify(def)}).`
          );
        }
      }
    }
  }
  return any ? merged : null;
}

// ---------------------------------------------------------------------------
// Overlap assertion (validation gate)
// ---------------------------------------------------------------------------

/**
 * @param {Array<{ name:string, x:number, y:number, w:number, h:number }>} rects
 * @returns {Array<[string,string]>} pairs of overlapping names (empty = OK)
 */
function findOverlaps(rects) {
  const bad = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlap) bad.push([a.name, b.name]);
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Main merge
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || process.argv.length <= 2) {
    console.log(USAGE);
    process.exit(opts.help ? 0 : 1);
  }
  if (!opts.out) die("--out <path> is required.");
  if (opts.inputs.length === 0) die("No input files/directories provided.");

  const outAbs = resolve(opts.out);
  const inputFiles = resolveInputFiles(opts.inputs);

  // Refuse to overwrite an input. Compare on resolved paths and, where they exist, realpaths.
  const outResolvedSet = new Set([outAbs]);
  try {
    outResolvedSet.add(realpathSync(outAbs));
  } catch {
    /* output may not exist yet — fine */
  }
  for (const f of inputFiles) {
    const candidates = new Set([f]);
    try {
      candidates.add(realpathSync(f));
    } catch {
      /* ignore */
    }
    for (const c of candidates) {
      if (outResolvedSet.has(c)) {
        die(`Refusing to run: --out (${opts.out}) is also an input (${f}). Choose a different output path.`);
      }
    }
  }

  /** @type {string[]} */
  const warnings = [];

  // ---- Parse all inputs (READ-ONLY) and collect pack units. ----
  /**
   * @type {Array<{ name:string, file:string, doc:any, frame:any, w:number, h:number, estimated:boolean }>}
   */
  const units = [];
  /** @type {Array<{ name:string, doc:any }>} */
  const docsForUnion = [];

  let version = null;

  for (const file of inputFiles) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (e) {
      die(`Could not read ${file}: ${e instanceof Error ? e.message : e}`);
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      die(`${file} is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    if (!doc || typeof doc !== "object") die(`${file}: document root is not an object.`);
    if (!Array.isArray(doc.children)) die(`${file}: missing "children" array.`);

    // Version gate.
    if (typeof doc.version === "string") {
      if (version === null) {
        version = doc.version;
      } else if (version !== doc.version) {
        warnings.push(
          `version mismatch: "${basename(file)}" is ${doc.version}, expected ${version}. ` +
            `Using ${version > doc.version ? version : doc.version} (max).`
        );
        version = version > doc.version ? version : doc.version;
      }
    }

    docsForUnion.push({ name: basename(file), doc });

    const stem = basename(file, extname(file));
    if (doc.children.length === 0) {
      warnings.push(`${basename(file)}: has no top-level children — skipped.`);
      continue;
    }
    // Normally exactly one top-level frame; if more, pack each as its own unit (and warn).
    if (doc.children.length > 1) {
      warnings.push(
        `${basename(file)}: has ${doc.children.length} top-level children — packing each independently.`
      );
    }
    doc.children.forEach((frame, idx) => {
      const name =
        typeof frame.name === "string" && frame.name.length > 0
          ? frame.name
          : doc.children.length > 1
          ? `${stem} [${idx}]`
          : stem;
      const w = effectiveWidth(frame);
      const pngPath = candidatePng(file, stem, opts.exportsDir);
      const { h, estimated, source } = effectiveHeight(frame, opts.fallbackH, pngPath, w);
      units.push({ name, file: basename(file), doc, frame, w, h, estimated, heightSource: source });
    });
  }

  if (units.length === 0) die("No top-level frames found across all inputs — nothing to merge.");
  if (version === null) version = "2.11"; // every sample is 2.11; safe default.

  // ---- Column geometry. ----
  const gap = opts.gap;
  const colW = units.reduce((m, u) => Math.max(m, u.w), 0);
  const stride = colW + gap;
  // How many columns fit inside MAX_W (right edge of last col <= MAX_W).
  const autoCols = Math.max(1, Math.floor((opts.maxW + gap) / stride));
  const cols = opts.cols != null ? opts.cols : autoCols;

  // ---- Column/shelf placement (deterministic, no overlap). ----
  // Walk columns left-to-right; fill each column top-to-bottom until the next frame would push
  // past MAX_H, then wrap to the next column. Frames are top-aligned within their column.
  /** @type {Array<{ name:string, x:number, y:number, w:number, h:number, estimated:boolean, file:string }>} */
  const placedMeta = [];
  let col = 0;
  let y = 0;
  for (const u of units) {
    if (y > 0 && y + u.h > opts.maxH) {
      col += 1;
      y = 0;
    }
    const x = col * stride;
    if (col >= cols) {
      warnings.push(
        `overflow: "${u.name}" (${u.file}) placed in column ${col} (x=${x}) beyond the ` +
          `${cols}-column / ${opts.maxW}px width budget — no overlap, canvas is infinite.`
      );
    }
    if (u.h > opts.maxH) {
      warnings.push(
        `"${u.name}" (${u.file}) effective height ${u.h} exceeds height budget ${opts.maxH} — ` +
          `placed alone in its column; not split.`
      );
    }
    if (u.estimated) {
      warnings.push(
        `"${u.name}" (${u.file}) has no explicit height AND no export PNG was found — ` +
          `reserved fallback ${u.h}px, which may overlap if the real screen is taller. ` +
          `Provide its export PNG (<stem>.png next to the .pen or via --exports) for an exact height.`
      );
    }
    placedMeta.push({ name: u.name, x, y, w: u.w, h: u.h, estimated: u.estimated, file: u.file, heightSource: u.heightSource });
    u._x = x;
    u._y = y;
    y += u.h + gap;
  }

  // ---- Build merged children (deep-clone each frame; mutate ONLY x/y). ----
  // Id-safety: collect all source ids; on a real cross-file collision, regenerate the id ONLY in
  // later sources and rewrite known references within that one cloned subtree.
  /** @type {Set<string>} */
  const globalIds = new Set();
  /** @type {any[]} */
  const mergedChildren = [];
  let regeneratedCount = 0;

  for (const u of units) {
    const clone = deepClone(u.frame);

    // Determine which ids in this clone collide with already-merged ids.
    const localIds = new Set();
    collectIds(clone, localIds);
    /** @type {Map<string,string>} */
    const idMap = new Map();
    for (const id of localIds) {
      if (globalIds.has(id)) {
        const fresh = generateId(globalIds); // adds fresh to globalIds
        idMap.set(id, fresh);
        regeneratedCount += 1;
      }
    }

    if (idMap.size > 0) {
      const report = { unknownRefs: [] };
      rewriteSubtreeIds(clone, idMap, report);
      if (report.unknownRefs.length > 0) {
        // A non-reference string field matched a remapped id. We cannot safely rewrite it
        // without risking content corruption, and leaving it would dangle the reference.
        // FAIL LOUDLY rather than silently corrupt the user's work.
        const sample = report.unknownRefs
          .slice(0, 5)
          .map((r) => `  field "${r.key}" = "${r.value}"`)
          .join("\n");
        die(
          `Id collision in "${u.name}" (${u.file}) required regeneration, but found string ` +
            `field(s) matching a remapped id that are NOT known reference fields:\n${sample}\n` +
            `Refusing to guess (could corrupt content). Resolve the id collision in the source, ` +
            `or extend REFERENCE_KEYS in this script if these are genuine references.`
        );
      }
      warnings.push(
        `id collision: "${u.name}" (${u.file}) had ${idMap.size} id(s) colliding with earlier ` +
          `frames — regenerated them (and updated known references) in the merged copy only. ` +
          `Source file untouched.`
      );
    }

    // Add this clone's (possibly remapped) ids to the global set.
    collectIds(clone, globalIds);

    // The ONLY positional mutation: top-level x/y.
    clone.x = u._x;
    clone.y = u._y;
    if (!(typeof clone.name === "string" && clone.name.length > 0)) {
      clone.name = u.name;
    }
    mergedChildren.push(clone);
  }

  // ---- Union document-level fields. ----
  const mergedVariables = unionKeyedField(docsForUnion, "variables", warnings);
  const mergedFonts = unionKeyedField(docsForUnion, "fonts", warnings);
  const mergedImports = unionKeyedField(docsForUnion, "imports", warnings);
  const mergedThemes = unionKeyedField(docsForUnion, "themes", warnings);

  /** @type {any} */
  const output = { version, children: mergedChildren };
  if (mergedVariables) output.variables = mergedVariables;
  if (mergedThemes) output.themes = mergedThemes;
  if (mergedImports) output.imports = mergedImports;
  if (mergedFonts) output.fonts = mergedFonts;

  // ---- Validation gate (fail-closed before writing). ----
  // (a) Round-trip JSON validity.
  let serialized;
  try {
    serialized = JSON.stringify(output, null, 2);
    JSON.parse(serialized);
  } catch (e) {
    die(`Internal error: merged document is not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
  // (b) Global id uniqueness.
  {
    const seen = new Set();
    const dups = new Set();
    function check(n) {
      if (Array.isArray(n)) return n.forEach(check);
      if (n && typeof n === "object") {
        if (typeof n.id === "string") {
          if (seen.has(n.id)) dups.add(n.id);
          else seen.add(n.id);
        }
        for (const k of Object.keys(n)) check(n[k]);
      }
    }
    check(output);
    if (dups.size > 0) {
      die(`Validation failed: duplicate ids remain in merged output: ${[...dups].slice(0, 10).join(", ")}`);
    }
  }
  // (c) No overlap (using ACTUAL placed boxes).
  const overlaps = findOverlaps(placedMeta);
  if (overlaps.length > 0) {
    die(
      `Validation failed: overlapping frames detected:\n` +
        overlaps.map(([a, b]) => `  "${a}" overlaps "${b}"`).join("\n")
    );
  }

  // ---- Write output (NEW file only). ----
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, serialized + "\n", "utf8");

  // ---- Summary. ----
  const totalRight = placedMeta.reduce((m, p) => Math.max(m, p.x + p.w), 0);
  const totalBottom = placedMeta.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const withinBudget = totalRight <= opts.maxW && totalBottom <= opts.maxH;

  console.log("Pencil .pen merge — summary");
  console.log("===========================");
  console.log(`Inputs (${inputFiles.length}, deterministic order):`);
  for (const f of inputFiles) console.log(`  - ${f}`);
  console.log("");
  console.log(`Output: ${outAbs}`);
  console.log(`Version: ${version}`);
  console.log(`Grid: ${cols} column(s), cellWidth=${colW}, gap=${gap}, stride=${stride}`);
  console.log("");
  console.log("Placed frames:");
  for (const p of placedMeta) {
    console.log(
      `  ${pad(p.name, 34)} x=${pad(p.x, 6)} y=${pad(p.y, 6)} w=${pad(p.w, 5)} h=${pad(p.h, 6)}` +
        `  [${p.heightSource}]`
    );
  }
  console.log("");
  console.log(
    `Total bounding box: ${totalRight} x ${totalBottom} px  ` +
      `(budget ${opts.maxW} x ${opts.maxH}) — ${withinBudget ? "WITHIN budget" : "EXCEEDS budget (placed anyway, no overlap)"}`
  );
  console.log(
    `Document-level fields merged:` +
      ` variables=${mergedVariables ? Object.keys(mergedVariables).length : 0}` +
      `, themes=${mergedThemes ? Object.keys(mergedThemes).length : 0}` +
      `, imports=${mergedImports ? Object.keys(mergedImports).length : 0}` +
      `, fonts=${mergedFonts ? Object.keys(mergedFonts).length : 0}`
  );
  if (regeneratedCount > 0) console.log(`Ids regenerated to avoid collisions: ${regeneratedCount}`);
  console.log("");
  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  } else {
    console.log("No warnings.");
  }
}

function pad(v, n) {
  const s = String(v);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

main();
