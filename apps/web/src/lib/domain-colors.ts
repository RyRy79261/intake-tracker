import type { CSSProperties } from "react";

/**
 * Ward Console domain colours.
 *
 * Every tracked domain owns one flat colour, defined once per theme in
 * `packages/ui/src/styles/globals.css` (`--water`, `--sodium`, … as HSL
 * channels, exposed to Tailwind as `--color-water`, …). This module maps a
 * domain to that token so components never hard-code a palette.
 *
 * The class strings below are written out literally on purpose: Tailwind only
 * emits utilities it can find verbatim in source, so `bg-${domain}` would be
 * silently dropped.
 */

export const DOMAINS = [
  "water",
  "sodium",
  "sugar",
  "caffeine",
  "alcohol",
  "bp",
  "weight",
  "bath",
  "meds",
  "ai",
] as const;

export type Domain = (typeof DOMAINS)[number];

/**
 * What a `data-domain` scope accepts (packages/ui/src/styles/globals.css): a
 * domain, or `ink` to return to the neutral ink inside another scope.
 *
 * A scope on a card, window, dialog or field sets `--c` to the colour and
 * re-points `--primary` / `--primary-foreground` / `--ring` at it, so the
 * shared primitives (primary Button, Switch, Checkbox, Tabs underline,
 * selected chip, focus ring, caret) take the colour with no per-control
 * classes. Portalled content (dialogs, sheets) needs its own attribute.
 */
export type DomainScope = Domain | "ink";

/** The CSS custom property (HSL channels) that holds each domain colour. */
export const DOMAIN_TOKEN: Record<Domain, `--${Domain}`> = {
  water: "--water",
  sodium: "--sodium",
  sugar: "--sugar",
  caffeine: "--caffeine",
  alcohol: "--alcohol",
  bp: "--bp",
  weight: "--weight",
  bath: "--bath",
  meds: "--meds",
  ai: "--ai",
};

/**
 * A usable CSS colour for a domain, e.g. `hsl(var(--water))`. Built from the
 * theme channels rather than `var(--color-water)`: the `@theme inline` colour
 * variables are only emitted when a utility uses them, so an inline `--c`
 * pointing at one can resolve to nothing.
 */
export function domainColor(domain: Domain): string {
  return `hsl(var(${DOMAIN_TOKEN[domain]}))`;
}

/**
 * Inline style that sets only `--c` to the domain colour, for a stripe, bar or
 * mark that must not re-tint the controls around it. Pair it with the `stripe`
 * utility (inset 3px left rule) or any `*-(--c)` arbitrary utility. To tint
 * the controls too, open a scope with `data-domain` instead.
 */
export function domainStripeStyle(domain: Domain): CSSProperties {
  return { "--c": domainColor(domain) } as CSSProperties;
}

export interface DomainClasses {
  /** Domain-coloured text (icons, values). */
  text: string;
  /** Solid fill (bars, pips, marks). */
  fill: string;
  /** 1px border in the domain colour. */
  border: string;
  /** Faint tint for an input or selected surface (not a pastel chip). */
  tint: string;
  /** Hover state for secondary controls. */
  hover: string;
  /** Selected toggle: domain border + faint tint. */
  active: string;
}

export const DOMAIN_CLASSES: Record<Domain, DomainClasses> = {
  water: {
    text: "text-water",
    fill: "bg-water",
    border: "border-water",
    tint: "bg-water/8 hover:bg-water/14",
    hover: "hover:bg-water/10 hover:border-water",
    active: "bg-water/10 border-water",
  },
  sodium: {
    text: "text-sodium",
    fill: "bg-sodium",
    border: "border-sodium",
    tint: "bg-sodium/8 hover:bg-sodium/14",
    hover: "hover:bg-sodium/10 hover:border-sodium",
    active: "bg-sodium/10 border-sodium",
  },
  sugar: {
    text: "text-sugar",
    fill: "bg-sugar",
    border: "border-sugar",
    tint: "bg-sugar/8 hover:bg-sugar/14",
    hover: "hover:bg-sugar/10 hover:border-sugar",
    active: "bg-sugar/10 border-sugar",
  },
  caffeine: {
    text: "text-caffeine",
    fill: "bg-caffeine",
    border: "border-caffeine",
    tint: "bg-caffeine/8 hover:bg-caffeine/14",
    hover: "hover:bg-caffeine/10 hover:border-caffeine",
    active: "bg-caffeine/10 border-caffeine",
  },
  alcohol: {
    text: "text-alcohol",
    fill: "bg-alcohol",
    border: "border-alcohol",
    tint: "bg-alcohol/8 hover:bg-alcohol/14",
    hover: "hover:bg-alcohol/10 hover:border-alcohol",
    active: "bg-alcohol/10 border-alcohol",
  },
  bp: {
    text: "text-bp",
    fill: "bg-bp",
    border: "border-bp",
    tint: "bg-bp/8 hover:bg-bp/14",
    hover: "hover:bg-bp/10 hover:border-bp",
    active: "bg-bp/10 border-bp",
  },
  weight: {
    text: "text-weight",
    fill: "bg-weight",
    border: "border-weight",
    tint: "bg-weight/8 hover:bg-weight/14",
    hover: "hover:bg-weight/10 hover:border-weight",
    active: "bg-weight/10 border-weight",
  },
  bath: {
    text: "text-bath",
    fill: "bg-bath",
    border: "border-bath",
    tint: "bg-bath/8 hover:bg-bath/14",
    hover: "hover:bg-bath/10 hover:border-bath",
    active: "bg-bath/10 border-bath",
  },
  meds: {
    text: "text-meds",
    fill: "bg-meds",
    border: "border-meds",
    tint: "bg-meds/8 hover:bg-meds/14",
    hover: "hover:bg-meds/10 hover:border-meds",
    active: "bg-meds/10 border-meds",
  },
  ai: {
    text: "text-ai",
    fill: "bg-ai",
    border: "border-ai",
    tint: "bg-ai/8 hover:bg-ai/14",
    hover: "hover:bg-ai/10 hover:border-ai",
    active: "bg-ai/10 border-ai",
  },
};
