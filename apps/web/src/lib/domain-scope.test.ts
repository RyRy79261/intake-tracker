import { describe, it, expect } from "vitest";
import { DOMAINS, DOMAIN_TOKEN } from "@/lib/domain-colors";
import {
  THEMES,
  contrast,
  globalsCss,
  mix,
  rgb,
  themeBlock,
  uiComponentSource,
} from "@/__tests__/helpers/palette";

/**
 * The domain scope (`data-domain`): one attribute on a card, window, dialog or
 * field tints its primary button, selected chips, switches, focus rings and
 * carets through the shared primitives. These tests pin the three links of
 * that chain: the CSS rule sets the variables, the primitives read them, and
 * every colour it can put on screen passes WCAG AA in both themes.
 */

/** Every colour a scope can carry: the tracked domains plus Settings' steel. */
const SCOPE_COLORS = [...DOMAINS.map((d) => [d, DOMAIN_TOKEN[d]] as const), ["steel", "--steel"] as const];

/** The declarations of one `selector { … }` rule. */
function rule(selector: string): string {
  const start = globalsCss.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return globalsCss.slice(start, globalsCss.indexOf("}", start));
}

describe("domain scope rule", () => {
  it("re-points the colour, primary, on-colour, hover and ring variables", () => {
    const scope = rule("\n  [data-domain]");
    expect(scope).toContain("--c: hsl(var(--d));");
    expect(scope).toContain("--primary: var(--d);");
    expect(scope).toContain("--primary-foreground: var(--onD);");
    expect(scope).toContain("--ring: var(--d);");
    // Hover mixes towards the ink, not towards transparent (see below).
    expect(scope).toContain("--primary-hover: color-mix(in srgb, hsl(var(--d)) 85%, hsl(var(--fg)));");
  });

  it.each(SCOPE_COLORS)("maps data-domain=%s onto %s", (name, token) => {
    expect(globalsCss).toContain(`[data-domain="${name}"] { --d: var(${token}); }`);
  });

  it("tints field borders and fills at rest, and the ink scope clears them", () => {
    const scope = rule("\n  [data-domain]");
    expect(scope).toContain("--field-line: color-mix(in srgb, hsl(var(--d)) 60%, hsl(var(--input)));");
    expect(scope).toContain("--field-bg: color-mix(in srgb, hsl(var(--d)) 7%, hsl(var(--background)));");
    expect(globalsCss).toContain("--color-input: var(--field-line, hsl(var(--input)));");
    const ink = rule('[data-domain="ink"]');
    expect(ink).toContain("--field-line: initial;");
    expect(ink).toContain("--field-bg: initial;");
  });

  it("gives every clickable control a pointer cursor", () => {
    const base = globalsCss.slice(globalsCss.indexOf("button:not(:disabled)"));
    expect(base.slice(0, base.indexOf("}"))).toContain("cursor: pointer;");
  });

  it("returns to the neutral ink with data-domain=ink", () => {
    const ink = rule('[data-domain="ink"]');
    expect(ink).toContain("--d: var(--fg);");
    expect(ink).toContain("--primary-foreground: var(--bg);");
  });

  it("keeps the ink primary outside a scope, in both themes", () => {
    for (const [, selector] of THEMES) {
      const block = themeBlock(selector);
      expect(block).toContain("--primary: var(--fg);");
      expect(block).toContain("--primary-foreground: var(--bg);");
      expect(block).toContain("--primary-hover: hsl(var(--fg) / 0.85);");
      expect(block).toContain("--ring: var(--fg);");
    }
  });
});

describe("shared primitives read the scope", () => {
  it("fills the primary Button with --primary and keeps the dashed disabled look", () => {
    const button = uiComponentSource("button");
    const primary = /default:\s*"([^"]+)"/.exec(button)?.[1] ?? "";
    expect(primary).toContain("bg-primary");
    expect(primary).toContain("text-primary-foreground");
    expect(primary).toContain("hover:bg-(--primary-hover)");
    expect(primary).toContain("disabled:border-dashed");
    expect(primary).toContain("disabled:bg-transparent");
    // The focus ring of every variant.
    expect(button).toContain("focus-visible:outline-ring");
  });

  it.each(["input", "textarea"])("gives %s a focus ring and caret in --ring", (name) => {
    const src = uiComponentSource(name);
    expect(src).toContain("focus-visible:outline-ring");
    expect(src).toContain("caret-ring");
  });

  it.each(["input", "textarea", "select"])("fills %s with the scope's --field-bg", (name) => {
    expect(uiComponentSource(name)).toContain("bg-[var(--field-bg,hsl(var(--background)))]");
  });

  it("fills an outline Button with the scope's --field-bg", () => {
    expect(uiComponentSource("button")).toContain("bg-[var(--field-bg,transparent)]");
  });

  it("gives Select a focus ring in --ring", () => {
    expect(uiComponentSource("select")).toContain("focus-visible:outline-ring");
  });

  it.each(["switch", "checkbox"])("fills a checked %s with --primary", (name) => {
    const src = uiComponentSource(name);
    expect(src).toContain("data-[state=checked]:bg-primary");
    expect(src).toContain("data-[state=checked]:border-primary");
    expect(src).toContain("focus-visible:outline-ring");
  });

  it("underlines the active tab with --primary", () => {
    expect(uiComponentSource("tabs")).toContain("data-[state=active]:shadow-[inset_0_-3px_0_hsl(var(--primary))]");
  });

  it("stripes a scoped dialog with --c", () => {
    expect(uiComponentSource("dialog")).toContain("data-[domain]:shadow-[inset_0_3px_0_var(--c)]");
  });
});

describe.each(THEMES)("%s palette", (_name, selector) => {
  const block = themeBlock(selector);
  const panel = rgb(block, "--panel");
  const onColour = rgb(block, "--onD");
  const ink = rgb(block, "--fg");

  it.each(SCOPE_COLORS)("%s: on-colour text passes AA on the fill, at rest and on hover", (_domain, token) => {
    const fill = rgb(block, token);
    // Primary button, selected chip, checked checkbox.
    expect(contrast(fill, onColour)).toBeGreaterThanOrEqual(4.5);
    // `--primary-hover`: 85% fill, 15% ink.
    expect(contrast(mix(fill, ink, 0.85), onColour)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCOPE_COLORS)("%s: passes AA as text on the panel, also under a hovered disclosure row", (_domain, token) => {
    // Sub-headings, units and selected option labels sit on the panel.
    expect(contrast(rgb(block, token), panel)).toBeGreaterThanOrEqual(4.5);
    // SubToggle's hover: the panel under a 4% ink wash.
    expect(contrast(rgb(block, token), mix(ink, panel, 0.04))).toBeGreaterThanOrEqual(4.5);
  });

  it("does not put domain-coloured text on the input surface", () => {
    // `--bg` (inputs) is darker than the panel by day: the greens fall under
    // AA there, which is why units inside a field stay muted.
    const onInput = SCOPE_COLORS.map(([, token]) => contrast(rgb(block, token), rgb(block, "--bg")));
    if (selector === ":root") expect(Math.min(...onInput)).toBeLessThan(4.5);
    expect(contrast(rgb(block, "--muted-fg"), rgb(block, "--bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCOPE_COLORS)("%s: a tinted field keeps its border, text and focus ring readable", (_domain, token) => {
    const c = rgb(block, token);
    const bg = rgb(block, "--bg");
    // `--field-bg`: 7% colour on the input surface. `--field-line`: 60% colour, 40% `--input` (= `--muted-fg`).
    const fieldBg = mix(c, bg, 0.07);
    const fieldLine = mix(c, rgb(block, "--muted-fg"), 0.6);
    expect(contrast(fieldLine, fieldBg), "border on the field").toBeGreaterThanOrEqual(3);
    expect(contrast(fieldLine, panel), "border on the panel").toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(block, "--fg"), fieldBg), "text").toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(block, "--muted-fg"), fieldBg), "placeholder and units").toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, fieldBg), "focus ring").toBeGreaterThanOrEqual(3);
  });

  it.each(SCOPE_COLORS)("%s: fills, stripes, pips and focus rings reach 3:1 on every surface", (_domain, token) => {
    const c = rgb(block, token);
    for (const surface of ["--panel", "--bg", "--chrome"]) {
      expect(contrast(c, rgb(block, surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it("fading the fill on hover would fail by day, which is why hover mixes towards the ink", () => {
    const faded = SCOPE_COLORS.map(([, token]) => contrast(mix(rgb(block, token), panel, 0.85), onColour));
    if (selector === ":root") expect(Math.min(...faded)).toBeLessThan(4.5);
    else expect(Math.min(...faded)).toBeGreaterThanOrEqual(4.5);
  });
});
