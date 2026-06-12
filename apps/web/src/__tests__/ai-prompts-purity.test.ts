/**
 * @intake/ai-prompts dependency-purity guard.
 *
 * The package holds the app's AI prompt/tool artifacts and is transitively
 * imported by CLIENT code (the analytics-insights zod schemas reach the bundle
 * via `analytics-snapshot` → `@/lib/db` and the `use-insights` React hook). So
 * it must NEVER pull the Anthropic SDK, `server-only`, the DB, Next, or React
 * into the graph — doing so would poison the client bundle or break the
 * DOM-free purity the package shares with @intake/types/@intake/core.
 *
 * This is a source scan (no build required); it complements the build-artifact
 * scan in bundle-security.test.ts.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PKG_SRC = path.resolve(process.cwd(), "../../packages/ai-prompts/src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      out.push(full);
  }
  return out;
}

// Pull every import/export-from source specifier out of a module — covers
// static `import … from`/`export … from`, bare side-effect `import "x"`, and
// lazy `import("x")` / `require("x")` (so a future dynamic SDK pull can't slip
// past the deny-list).
function importSources(code: string): string[] {
  const sources: string[] = [];
  let m: RegExpExecArray | null;
  const staticFrom = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  while ((m = staticFrom.exec(code)) !== null) if (m[1]) sources.push(m[1]);
  const sideEffect = /import\s*["']([^"']+)["']/g;
  while ((m = sideEffect.exec(code)) !== null) if (m[1]) sources.push(m[1]);
  const dynamic = /(?:import|require)\s*\(\s*["']([^"']+)["']/g;
  while ((m = dynamic.exec(code)) !== null) if (m[1]) sources.push(m[1]);
  return sources;
}

const FORBIDDEN = [
  "@anthropic-ai/sdk",
  "server-only",
  "@intake/db",
  "next-themes",
];
// Only these non-relative specifiers are allowed.
const ALLOWED_BARE = (s: string) =>
  s === "zod" ||
  s.startsWith("zod/") ||
  s === "@intake/types" ||
  s.startsWith("@intake/types/");

describe("@intake/ai-prompts purity", () => {
  const files = tsFiles(PKG_SRC);

  it("has source files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("never imports the Anthropic SDK, server-only, the DB, Next, or React", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = fs.readFileSync(file, "utf-8");
      for (const src of importSources(code)) {
        const rel = path.relative(PKG_SRC, file);
        if (FORBIDDEN.includes(src)) offenders.push(`${rel} → ${src}`);
        if (src === "next" || src.startsWith("next/"))
          offenders.push(`${rel} → ${src}`);
        if (src === "react" || src.startsWith("react/") || src === "react-dom")
          offenders.push(`${rel} → ${src}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only depends on @intake/types + zod (and relative imports)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = fs.readFileSync(file, "utf-8");
      for (const src of importSources(code)) {
        if (src.startsWith(".")) continue; // relative — fine
        if (ALLOWED_BARE(src)) continue;
        offenders.push(`${path.relative(PKG_SRC, file)} → ${src}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
