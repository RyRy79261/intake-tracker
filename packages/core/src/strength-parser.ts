/**
 * One parser for free-text pill strengths ("5 mg", "1,000 mg", ".5mg",
 * "100 mcg", "49/51 mg").
 *
 * Every screen that turns strength text into numbers must agree, or the
 * preview and the saved record drift apart (the wizard once previewed
 * "1,000 mg" as 1 mg and saved it as 0). The parser:
 *
 *   - strips thousands separators ("1,000" / "1 000" ⇒ 1000) while keeping a
 *     decimal comma ("2,5" ⇒ 2.5),
 *   - reads a leading-dot decimal (".5" ⇒ 0.5, never 5),
 *   - sums slash-separated combination strengths ("49/51" ⇒ 100), matching the
 *     pill-math convention in compound-utils,
 *   - only accepts the controlled unit list (mg / mcg / g / ml); no unit means
 *     mg, an unknown unit is rejected rather than guessed.
 *
 * `null` means "could not read a positive strength" — callers block save.
 */

export const STRENGTH_UNITS = ["mg", "mcg", "g", "ml"] as const;
export type StrengthUnit = (typeof STRENGTH_UNITS)[number];

export interface ParsedStrength {
  value: number;
  unit: StrengthUnit;
}

const UNIT_ALIASES: Record<string, StrengthUnit> = {
  mg: "mg",
  milligram: "mg",
  milligrams: "mg",
  mcg: "mcg",
  ug: "mcg",
  "µg": "mcg",
  "μg": "mcg",
  microgram: "mcg",
  micrograms: "mcg",
  g: "g",
  gm: "g",
  gram: "g",
  grams: "g",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
};

/** Canonical unit for a free-text unit, or `null` when it isn't supported. */
export function normalizeStrengthUnit(unit: string | null | undefined): StrengthUnit | null {
  if (!unit) return null;
  return UNIT_ALIASES[unit.trim().toLowerCase()] ?? null;
}

// A number: grouped thousands ("1,000", "1 000", "1,000.5"), a plain or
// decimal-comma number ("12", "2.5", "2,5") or a leading-dot decimal (".5").
// A number glued to a preceding letter or digit ("B12") is part of a name,
// not a strength.
const NUMBER = String.raw`(?:\d{1,3}(?:[, ]\d{3})+(?!\d)(?:\.\d+)?|\d+(?:[.,]\d+)?|\.\d+)`;
const STRENGTH_RE = new RegExp(
  String.raw`(?<![A-Za-z\d.])(${NUMBER}(?:\s*/\s*${NUMBER})*)\s*([a-zA-Zµμ]+)?`,
);

function toNumber(token: string): number {
  const t = token.trim();
  // Grouped thousands: separators sit before exactly three digits.
  if (/^\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?$/.test(t)) {
    return parseFloat(t.replace(/[, ]/g, ""));
  }
  return parseFloat(t.replace(",", "."));
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Read a strength from free text. Returns `null` for blank text, text with no
 * number, an unsupported unit, or a strength that isn't a positive finite
 * number.
 */
export function parseStrength(text: string | null | undefined): ParsedStrength | null {
  if (!text) return null;
  const match = text.match(STRENGTH_RE);
  if (!match?.[1]) return null;

  const value = round(
    match[1].split("/").reduce((sum, part) => sum + toNumber(part), 0),
  );
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] ? normalizeStrengthUnit(match[2]) : "mg";
  if (!unit) return null;
  return { value, unit };
}

// Mass units convert through mg; volume (ml) has no mass equivalent.
const MG_PER_UNIT: Partial<Record<StrengthUnit, number>> = {
  mcg: 0.001,
  mg: 1,
  g: 1000,
};

/**
 * Convert a strength between units. Returns `null` when the units can't be
 * converted (mass ↔ volume, or an unsupported unit).
 */
export function convertStrength(
  value: number,
  from: string,
  to: string,
): number | null {
  const f = normalizeStrengthUnit(from);
  const t = normalizeStrengthUnit(to);
  if (!f || !t) return null;
  if (f === t) return value;
  const fromMg = MG_PER_UNIT[f];
  const toMg = MG_PER_UNIT[t];
  if (fromMg === undefined || toMg === undefined) return null;
  return round((value * fromMg) / toMg);
}

/** Human label for a parsed strength, e.g. `1000 mg`. */
export function formatStrength(parsed: ParsedStrength): string {
  return `${parsed.value} ${parsed.unit}`;
}
