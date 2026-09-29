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

/** A usable CSS colour for a domain, e.g. `var(--color-water)`. */
export function domainColor(domain: Domain): string {
  return `var(--color-${domain})`;
}

/**
 * Inline style that sets `--c` to the domain colour. Pair it with the `stripe`
 * utility (inset 3px left rule) or any `*-(--c)` arbitrary utility.
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
  /** Primary action: solid domain block with on-domain text. */
  solid: string;
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
    solid: "bg-water text-on-domain hover:bg-water/90",
    tint: "bg-water/8 hover:bg-water/14",
    hover: "hover:bg-water/10 hover:border-water",
    active: "bg-water/10 border-water",
  },
  sodium: {
    text: "text-sodium",
    fill: "bg-sodium",
    border: "border-sodium",
    solid: "bg-sodium text-on-domain hover:bg-sodium/90",
    tint: "bg-sodium/8 hover:bg-sodium/14",
    hover: "hover:bg-sodium/10 hover:border-sodium",
    active: "bg-sodium/10 border-sodium",
  },
  sugar: {
    text: "text-sugar",
    fill: "bg-sugar",
    border: "border-sugar",
    solid: "bg-sugar text-on-domain hover:bg-sugar/90",
    tint: "bg-sugar/8 hover:bg-sugar/14",
    hover: "hover:bg-sugar/10 hover:border-sugar",
    active: "bg-sugar/10 border-sugar",
  },
  caffeine: {
    text: "text-caffeine",
    fill: "bg-caffeine",
    border: "border-caffeine",
    solid: "bg-caffeine text-on-domain hover:bg-caffeine/90",
    tint: "bg-caffeine/8 hover:bg-caffeine/14",
    hover: "hover:bg-caffeine/10 hover:border-caffeine",
    active: "bg-caffeine/10 border-caffeine",
  },
  alcohol: {
    text: "text-alcohol",
    fill: "bg-alcohol",
    border: "border-alcohol",
    solid: "bg-alcohol text-on-domain hover:bg-alcohol/90",
    tint: "bg-alcohol/8 hover:bg-alcohol/14",
    hover: "hover:bg-alcohol/10 hover:border-alcohol",
    active: "bg-alcohol/10 border-alcohol",
  },
  bp: {
    text: "text-bp",
    fill: "bg-bp",
    border: "border-bp",
    solid: "bg-bp text-on-domain hover:bg-bp/90",
    tint: "bg-bp/8 hover:bg-bp/14",
    hover: "hover:bg-bp/10 hover:border-bp",
    active: "bg-bp/10 border-bp",
  },
  weight: {
    text: "text-weight",
    fill: "bg-weight",
    border: "border-weight",
    solid: "bg-weight text-on-domain hover:bg-weight/90",
    tint: "bg-weight/8 hover:bg-weight/14",
    hover: "hover:bg-weight/10 hover:border-weight",
    active: "bg-weight/10 border-weight",
  },
  bath: {
    text: "text-bath",
    fill: "bg-bath",
    border: "border-bath",
    solid: "bg-bath text-on-domain hover:bg-bath/90",
    tint: "bg-bath/8 hover:bg-bath/14",
    hover: "hover:bg-bath/10 hover:border-bath",
    active: "bg-bath/10 border-bath",
  },
  meds: {
    text: "text-meds",
    fill: "bg-meds",
    border: "border-meds",
    solid: "bg-meds text-on-domain hover:bg-meds/90",
    tint: "bg-meds/8 hover:bg-meds/14",
    hover: "hover:bg-meds/10 hover:border-meds",
    active: "bg-meds/10 border-meds",
  },
  ai: {
    text: "text-ai",
    fill: "bg-ai",
    border: "border-ai",
    solid: "bg-ai text-on-domain hover:bg-ai/90",
    tint: "bg-ai/8 hover:bg-ai/14",
    hover: "hover:bg-ai/10 hover:border-ai",
    active: "bg-ai/10 border-ai",
  },
};
