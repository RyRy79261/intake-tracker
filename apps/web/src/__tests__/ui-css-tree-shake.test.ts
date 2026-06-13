/**
 * @intake/ui CSS tree-shake guard (Phase 4b).
 *
 * The shadcn primitives + the Tailwind v4 design-system tokens moved into
 * @intake/ui, which lives under node_modules via the workspace symlink — outside
 * Tailwind's project auto-scan. A package-relative `@source` in
 * packages/ui/src/styles/globals.css re-includes them. If that `@source` is ever
 * dropped or mis-pathed, the utilities used ONLY by the moved primitives get
 * silently tree-shaken out of the compiled CSS with ZERO build error — the app
 * just renders unstyled. This test turns that silent failure into a hard gate.
 *
 * Requires a build first (`pnpm build`); skips otherwise (like
 * bundle-security.test.ts).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function allCssRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allCssRecursive(full));
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

const staticDir = path.resolve(process.cwd(), ".next/static");
const cssFiles = allCssRecursive(staticDir);
const css = cssFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");
const hasBuild = cssFiles.length > 0;

describe.skipIf(!hasBuild)("@intake/ui compiled-CSS tree-shake guard", () => {
  it("emits utilities used ONLY by moved primitives (the @source canary)", () => {
    // animate-accordion-up/down is referenced exclusively by the moved
    // accordion.tsx — its presence proves the package @source is scanned.
    expect(css).toMatch(/animate-accordion-up/);
    expect(css).toMatch(/animate-accordion-down/);
  });

  it("emits the tw-animate-css utilities the moved dialog/sheet rely on", () => {
    expect(css).toMatch(/animate-in/);
    expect(css).toMatch(/animate-out/);
  });

  it("emits the custom theme-color utilities (water/salt) from @theme inline", () => {
    expect(css).toContain("bg-water");
    expect(css).toContain("bg-salt");
  });

  it("keeps the dark-mode override block (channel vars re-resolve at runtime)", () => {
    expect(css).toContain(".dark");
    // dark-mode --water channel override from the moved :root/.dark block
    expect(css).toMatch(/--water:\s*200 90% 50%/);
  });
});
