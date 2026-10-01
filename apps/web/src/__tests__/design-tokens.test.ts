/**
 * Ward Console design tokens — every domain colour (and the surface tokens the
 * primitives rely on) must be defined in BOTH themes: `:root` (day / light)
 * and `.dark` (night). A token missing from one theme silently falls back to
 * the other theme's value, which is how low-contrast colours sneak in.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DOMAINS, DOMAIN_TOKEN, domainColor } from "@/lib/domain-colors";

const GLOBALS_CSS = path.resolve(
  process.cwd(),
  "../../packages/ui/src/styles/globals.css",
);

const css = fs.readFileSync(GLOBALS_CSS, "utf-8");

/** Custom properties declared directly inside the first `<selector> { … }`. */
function tokensIn(selector: string): Map<string, string> {
  const start = css.search(new RegExp(`^\\s*${selector.replace(".", "\\.")}\\s*\\{`, "m"));
  if (start === -1) throw new Error(`${selector} block not found in globals.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(m[1]!, m[2]!.trim());
  }
  return tokens;
}

const day = tokensIn(":root");
const night = tokensIn(".dark");

const SURFACE_TOKENS = ["--bg", "--panel", "--chrome", "--line", "--fg", "--muted-fg", "--onD", "--grid"];
const HSL_CHANNELS = /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/;

describe("Ward Console design tokens", () => {
  it.each(DOMAINS)("domain token --%s exists in both themes as HSL channels", (domain) => {
    const token = DOMAIN_TOKEN[domain];
    expect(day.get(token), `${token} missing from :root`).toMatch(HSL_CHANNELS);
    expect(night.get(token), `${token} missing from .dark`).toMatch(HSL_CHANNELS);
  });

  it("domain colours differ between day and night", () => {
    for (const domain of DOMAINS) {
      const token = DOMAIN_TOKEN[domain];
      expect(day.get(token)).not.toBe(night.get(token));
    }
  });

  it.each(SURFACE_TOKENS)("surface token %s exists in both themes", (token) => {
    expect(day.has(token), `${token} missing from :root`).toBe(true);
    expect(night.has(token), `${token} missing from .dark`).toBe(true);
  });

  it("every domain is exposed to Tailwind as a --color-* utility", () => {
    for (const domain of DOMAINS) {
      expect(css).toContain(`--color-${domain}: hsl(var(--${domain}));`);
      expect(domainColor(domain)).toBe(`hsl(var(--${domain}))`);
    }
  });

  it("uses sharp corners", () => {
    expect(day.get("--radius")).toBe("0px");
  });
});
