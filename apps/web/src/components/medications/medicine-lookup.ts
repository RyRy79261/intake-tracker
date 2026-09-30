/**
 * Pure logic behind the AI medicine lookup panel: normalising a
 * `medicine_search_result`, the per-group values the panel offers to fill in,
 * and the mapping of the ticked groups into each host form (the Add
 * prescription wizard, the add-a-brand wizard and Prescription Details).
 *
 * A straight port of the prototype's `medResult`, `grpVal`, `grpWhy`,
 * `brandLabel` and `lookApplyTo`.
 */
import type { CompoundStrength, FoodInstruction, PillShape } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { MedicineSearchResult } from "@/hooks/use-medicine-search";
import { parseStrength } from "@intake/core/strength";
import { COLOR_NAME_MAP, PILL_SHAPES } from "@/components/medications/add-medication-steps/types";

/** A group of fields the lookup can fill in on its host form. */
export type LookupGroup =
  | "names"
  | "brand"
  | "generic"
  | "strength"
  | "compounds"
  | "appearance"
  | "indication"
  | "food";

export const GROUP_LABELS: Record<LookupGroup, string> = {
  names: "Name and brand",
  brand: "Brand name",
  generic: "Generic name",
  strength: "Strength",
  compounds: "Compounds",
  appearance: "Shape, colour and markings",
  indication: "What it is for",
  food: "Food instruction",
};

export const FOOD_LABELS: Record<FoodInstruction, string> = {
  before: "Before eating",
  after: "After eating",
  none: "No instruction",
};

/** One marketed strength: what is in each pill. */
export interface LookupOption {
  label: string;
  compounds: CompoundStrength[];
  /** Unit of the compound strengths. */
  unit: string;
}

/** A search result with every list defaulted and the brand resolved. */
export interface LookupResult extends MedicineSearchResult {
  /** The query that produced it. */
  query: string;
  /** No medicine matched the query. */
  none: boolean;
  /** The brand the query names, else the first brand found. */
  brand: string;
  /** Strength options to pick from (from `strengthOptions`, else `dosageStrengths`). */
  options: LookupOption[];
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const capWords = (s: string) => s.split(" ").map(cap).join(" ");
const nf = (n: number) => String(Math.round(n * 10000) / 10000);

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/**
 * Default every list (a mocked or older reply can omit them), resolve the
 * brand the user typed, and build the strength options.
 */
export function normalizeLookupResult(raw: Partial<MedicineSearchResult>, query: string): LookupResult {
  const r: MedicineSearchResult = {
    brandNames: list(raw.brandNames),
    localAlternatives: list(raw.localAlternatives),
    genericName: raw.genericName ?? "",
    dosageStrengths: list(raw.dosageStrengths),
    activeIngredients: list(raw.activeIngredients),
    strengthOptions: Array.isArray(raw.strengthOptions) ? raw.strengthOptions : [],
    commonIndications: list(raw.commonIndications),
    foodInstruction: raw.foodInstruction ?? "none",
    pillColor: raw.pillColor ?? "",
    pillShape: raw.pillShape ?? "",
    pillDescription: raw.pillDescription ?? "",
    drugClass: raw.drugClass ?? "",
    contraindications: list(raw.contraindications),
    warnings: list(raw.warnings),
    isGenericFallback: raw.isGenericFallback ?? false,
    ...(raw.foodNote && { foodNote: raw.foodNote }),
    ...(raw.visualIdentification && { visualIdentification: raw.visualIdentification }),
  };
  const none = !r.genericName && r.brandNames.length === 0 && r.activeIngredients.length === 0;

  const ql = query.toLowerCase();
  const hit = r.brandNames.find((b) => ql.includes(b.toLowerCase()));
  let brand = hit ?? r.brandNames[0] ?? "";
  if (r.isGenericFallback && !hit) {
    // The brand the user typed wasn't found: keep their name for it.
    const typed = capWords(
      query.replace(/\b\d+([.,]\d+)?\s*(mg|mcg|g|ml)?\b/gi, "").replace(/\s+/g, " ").trim(),
    );
    if (typed) brand = typed;
  }

  const fromOptions: LookupOption[] = r.strengthOptions
    .filter((o) => o && typeof o.label === "string" && Array.isArray(o.compounds) && o.compounds.length > 0)
    .map((o) => ({
      label: o.label,
      compounds: o.compounds.map((c) => ({ name: c.name, strength: c.strength })),
      unit: "mg",
    }));
  // Plain strengths only describe a single drug: a combination with no
  // per-compound breakdown gets no options (its compounds are named only).
  const options: LookupOption[] =
    fromOptions.length > 0 || r.activeIngredients.length >= 2
      ? fromOptions
      : r.dosageStrengths.flatMap((s) => {
          const parsed = parseStrength(s);
          if (!parsed) return [];
          const name = r.genericName || r.activeIngredients[0] || "";
          return [{ label: s, compounds: [{ name, strength: parsed.value }], unit: parsed.unit }];
        });

  return { ...r, query, none, brand, options };
}

const optionSum = (o: LookupOption) => o.compounds.reduce((a, c) => a + c.strength, 0);

/** The strength the query names (e.g. "Concor 5"), else the only one. */
export function defaultOption(r: LookupResult, query: string): number | null {
  const m = query.match(/\d+([.,]\d+)?/);
  if (m) {
    const v = Number(m[0].replace(",", "."));
    const i = r.options.findIndex(
      (o) => parseFloat(o.label) === v || Math.abs(optionSum(o) - v) < 1e-9,
    );
    if (i >= 0) return i;
  }
  return r.options.length === 1 ? 0 : null;
}

/** "Sacubitril 49 mg + Valsartan 51 mg". */
export function optionText(o: LookupOption): string {
  return o.compounds.map((c) => `${c.name} ${nf(c.strength)} ${o.unit}`).join(" + ");
}

/** The brand name to fill in: the brand plus the picked strength's number. */
export function brandLabel(r: LookupResult, o: LookupOption | null): string {
  const n = o ? (o.label.match(/^[\d.,]+/) ?? [""])[0] : "";
  const base = r.brand || r.brandNames[0] || r.genericName;
  return base + (n ? ` ${n}` : "");
}

/** The first use, without bracketed asides ("Heart failure"). */
export function plainIndication(r: LookupResult): string {
  return (r.commonIndications[0] ?? "").replace(/\s*\([^)]*\)/g, "").trim();
}

/** A pill colour the form can show, as its hex. */
export function colorHex(r: LookupResult): string | undefined {
  return r.pillColor ? COLOR_NAME_MAP[r.pillColor.toLowerCase()] : undefined;
}

/** A pill shape the form can show. */
export function shapeValue(r: LookupResult): PillShape | undefined {
  const s = r.pillShape.toLowerCase();
  return PILL_SHAPES.some((p) => p.value === s) ? (s as PillShape) : undefined;
}

/** The text a group would fill in, or "" when the result has nothing for it. */
export function groupValue(g: LookupGroup, r: LookupResult, o: LookupOption | null): string {
  switch (g) {
    case "names":
      return r.genericName ? `${r.genericName} · ${brandLabel(r, o)}` : "";
    case "brand":
      return r.brandNames.length || r.brand ? brandLabel(r, o) : "";
    case "generic":
      return r.genericName;
    case "strength":
      return o ? o.label + (o.compounds.length > 1 ? ` = ${optionText(o)}` : "") : "";
    case "compounds":
      return o && o.compounds.length > 1 ? optionText(o) : "";
    case "appearance": {
      if (!r.pillShape && !r.pillColor) return "";
      const mark = r.visualIdentification ? `, marked ${r.visualIdentification}` : "";
      return `${cap(r.pillColor)} ${r.pillShape}`.trim() + mark;
    }
    case "indication":
      return plainIndication(r);
    case "food":
      return FOOD_LABELS[r.foodInstruction] + (r.foodNote ? `. ${r.foodNote}` : "");
  }
}

/** Why a group has nothing to fill in. */
export function groupWhy(g: LookupGroup, r: LookupResult): string {
  if ((g === "strength" || g === "compounds") && r.options.length) {
    return g === "compounds" && r.activeIngredients.length < 2
      ? "Single drug: no compounds to fill in"
      : "Pick a strength first";
  }
  return "Not in the result";
}

/** What was filled in, for the "Filled in from AI lookup" summary. */
export function appliedLabel(g: LookupGroup, r: LookupResult): string {
  switch (g) {
    case "names":
      return "name and brand";
    case "appearance":
      return r.visualIdentification ? "shape, colour and markings" : "shape and colour";
    default:
      return GROUP_LABELS[g].toLowerCase();
  }
}

/** Groups whose value depends on the picked strength. */
export const OPTION_GROUPS: ReadonlySet<LookupGroup> = new Set(["names", "brand", "strength", "compounds"]);

// ─── Host mappings ────────────────────────────────────────────────────────

const emptyCompounds = (): CompoundStrength[] => [
  { name: "", strength: 0 },
  { name: "", strength: 0 },
];

/** The strength text for a single-compound option ("5 mg"). */
function singleStrength(o: LookupOption): string {
  return parseStrength(o.label) ? o.label : `${nf(optionSum(o))} ${o.unit}`;
}

function appearancePatch(r: LookupResult): Partial<AddMedicationFormState> {
  const p: Partial<AddMedicationFormState> = {};
  const hex = colorHex(r);
  const shape = shapeValue(r);
  if (hex) p.pillColor = hex;
  if (shape) p.pillShape = shape;
  if (r.visualIdentification) p.visualIdentification = r.visualIdentification;
  return p;
}

/**
 * Add prescription wizard (a new prescription). `groups` are the ticked
 * groups that have a value.
 */
export function applyToNewPrescription(
  groups: readonly LookupGroup[],
  r: LookupResult,
  o: LookupOption | null,
): Partial<AddMedicationFormState> {
  // The query is not written to the form: `searchQuery` has no field any
  // more, so it must not stand in for a brand name the user cleared.
  const p: Partial<AddMedicationFormState> = {
    searchResult: r,
    // The safety notes belong to the medicine, not to a ticked group: every
    // apply stores them on the prescription.
    contraindications: r.contraindications,
    warnings: r.warnings,
  };
  const on = (g: LookupGroup) => groups.includes(g);
  if (on("names")) {
    p.genericName = capWords(r.genericName);
    p.brandName = brandLabel(r, o);
    if (r.activeIngredients.length < 2) {
      // A single drug: clear combination state left by an earlier lookup
      // (the strength group below sets it again when it applies).
      p.isCombination = false;
      p.compounds = emptyCompounds();
    } else if (!(on("strength") && o)) {
      // A combination with no strength filled in: name its compounds so only
      // the per-pill mg are left to enter.
      p.isCombination = true;
      p.compounds = r.activeIngredients.map((name) => ({ name, strength: 0 }));
    }
  }
  if (on("strength") && o) {
    if (o.compounds.length > 1) {
      p.isCombination = true;
      p.compounds = o.compounds.map((c) => ({ ...c }));
    } else {
      p.isCombination = false;
      p.compounds = emptyCompounds();
      p.dosageStrength = singleStrength(o);
    }
    p.dosageAmount = 1;
    p.customDosage = "";
  }
  if (on("appearance")) Object.assign(p, appearancePatch(r));
  if (on("indication")) p.indication = plainIndication(r);
  if (on("food")) {
    p.foodInstruction = r.foodInstruction;
    p.foodNote = r.foodNote ?? "";
  }
  return p;
}

/**
 * The wizard adding a brand (box) to an existing prescription. The
 * prescription fixes the compound names; a combination brand only takes the
 * per-pill strengths.
 */
export function applyToNewBrand(
  groups: readonly LookupGroup[],
  r: LookupResult,
  o: LookupOption | null,
  form: Pick<AddMedicationFormState, "isCombination" | "compounds">,
): Partial<AddMedicationFormState> {
  const p: Partial<AddMedicationFormState> = { searchResult: r };
  const on = (g: LookupGroup) => groups.includes(g);
  if (on("brand")) p.brandName = brandLabel(r, o);
  if (on("strength") && o) {
    if (form.isCombination) {
      p.compounds = form.compounds.map((c, i) => {
        const m =
          o.compounds.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()) ??
          o.compounds[i];
        return { name: c.name, strength: m ? m.strength : c.strength };
      });
    } else {
      p.dosageStrength = o.compounds.length > 1 ? `${nf(optionSum(o))} ${o.unit}` : singleStrength(o);
    }
  }
  if (on("appearance")) Object.assign(p, appearancePatch(r));
  return p;
}

export interface DetailsForm {
  name: string;
  indication: string;
}

/** Prescription Details (the edit form in the prescription drawer). */
export function applyToDetails(groups: readonly LookupGroup[], r: LookupResult): Partial<DetailsForm> {
  const p: Partial<DetailsForm> = {};
  if (groups.includes("generic")) p.name = capWords(r.genericName);
  if (groups.includes("indication")) p.indication = plainIndication(r);
  return p;
}
