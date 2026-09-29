/**
 * Read and build the two stored AI answers on a prescription:
 * `medicineInfo` ("About this medicine") and `interactionCheck`.
 *
 * Both are non-indexed JSON. A row pulled from the server can carry `null`
 * where a local write left a field out (or a whole nested value), and a hand
 * edited backup can carry anything, so the view reads them only through the
 * normalisers here. They never throw: a value with no usable content reads
 * as "nothing stored".
 */

import type {
  FoodInstruction,
  InteractionCheck,
  InteractionCheckRow,
  InteractionSeverity,
  MedicineInfo,
  MedicineInfoCompound,
  MedicineInfoWarning,
} from "@intake/types/records";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s) => s !== "") : [];
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const FOOD: ReadonlySet<string> = new Set(["before", "after", "none"]);
const SEVERITY_ORDER: Record<InteractionSeverity, number> = { AVOID: 0, CAUTION: 1, OK: 2 };

/** The description `withUnassessedMedications` gives a skipped medication. */
const NOT_ASSESSED_PREFIX = "Not assessed:";

/** The stored "About this medicine", or null when none is usable. */
export function normalizeMedicineInfo(raw: unknown): MedicineInfo | null {
  if (!isObj(raw)) return null;
  const fetchedAt = num(raw.fetchedAt);
  if (fetchedAt === null) return null;

  const compounds: MedicineInfoCompound[] = (Array.isArray(raw.compounds) ? raw.compounds : [])
    .filter(isObj)
    .map((c) => ({
      name: str(c.name),
      drugClass: str(c.drugClass),
      forText: str(c.forText),
      howItWorks: str(c.howItWorks),
      sideEffects: strList(c.sideEffects),
    }))
    .filter((c) => c.name !== "");
  const warnings: MedicineInfoWarning[] = (Array.isArray(raw.warnings) ? raw.warnings : [])
    .filter(isObj)
    .map((w) => ({ risk: str(w.risk), whatToDo: str(w.whatToDo) }))
    .filter((w) => w.risk !== "");
  const drugClass = str(raw.drugClass);
  if (compounds.length === 0 && !drugClass) return null;

  const food = str(raw.foodInstruction);
  const visualIdentification = str(raw.visualIdentification);
  return {
    fetchedAt,
    drugClass,
    compounds,
    warnings,
    contraindications: strList(raw.contraindications),
    foodInstruction: (FOOD.has(food) ? food : "none") as FoodInstruction,
    foodNote: str(raw.foodNote),
    pillDescription: str(raw.pillDescription),
    ...(visualIdentification && { visualIdentification }),
  };
}

/** The stored interaction check, or null when none is usable. */
export function normalizeInteractionCheck(raw: unknown): InteractionCheck | null {
  if (!isObj(raw)) return null;
  const checkedAt = num(raw.checkedAt);
  if (checkedAt === null) return null;
  const rows: InteractionCheckRow[] = (Array.isArray(raw.rows) ? raw.rows : [])
    .filter(isObj)
    .flatMap((r) => {
      const medication = str(r.medication);
      const severity = str(r.severity);
      if (!medication || !(severity in SEVERITY_ORDER)) return [];
      return [
        {
          medication,
          severity: severity as InteractionSeverity,
          description: str(r.description),
          ...(r.notAssessed === true && { notAssessed: true }),
        },
      ];
    });
  return {
    checkedAt,
    medications: strList(raw.medications),
    summary: str(raw.summary) || summarizeRows(rows),
    rows: sortRows(rows),
  };
}

function sortRows(rows: InteractionCheckRow[]): InteractionCheckRow[] {
  // Not-assessed rows are CAUTION; they sort after the assessed cautions.
  const rank = (r: InteractionCheckRow) => SEVERITY_ORDER[r.severity] * 2 + (r.notAssessed ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/** A plain one-line summary when the AI gave none. */
export function summarizeRows(rows: InteractionCheckRow[]): string {
  if (rows.some((r) => r.severity === "AVOID")) {
    return "Do not take some of these together. Talk to your doctor before your next dose.";
  }
  if (rows.some((r) => r.severity === "CAUTION" && !r.notAssessed)) {
    return "You can take these together, but take care. Read each row below.";
  }
  if (rows.some((r) => r.notAssessed)) {
    return "Some combinations were not assessed. Check them with your pharmacist.";
  }
  return "No important interactions were found.";
}

/** The interaction-check route's answer, as the hook receives it. */
export interface InteractionRouteResult {
  interactions: { medication: string; severity: InteractionSeverity; description: string }[];
  drugClass?: string;
  summary?: string;
}

/** The structured check to store, from a conflict-mode route answer. */
export function buildInteractionCheck(
  result: InteractionRouteResult,
  medications: string[],
  checkedAt: number,
): InteractionCheck {
  const rows: InteractionCheckRow[] = result.interactions.map((i) => ({
    medication: i.medication,
    severity: i.severity,
    description: i.description,
    ...(i.description.startsWith(NOT_ASSESSED_PREFIX) && { notAssessed: true }),
  }));
  return {
    checkedAt,
    medications: [...medications],
    summary: result.summary?.trim() || summarizeRows(rows),
    rows: sortRows(rows),
  };
}

/**
 * The legacy flat strings (`contraindications` / `warnings`) older builds
 * and the export still read. Kept in step with every new check.
 */
export function legacyInteractionFields(result: InteractionRouteResult): {
  contraindications: string[];
  warnings: string[];
} {
  const contraindications = result.interactions
    .filter((i) => i.severity === "AVOID")
    .map((i) => `${i.medication}: ${i.description}`);
  const warnings = result.interactions
    .filter((i) => i.severity === "CAUTION")
    .map((i) => `${i.medication}: ${i.description}`);
  if (result.drugClass) warnings.unshift(`Drug class: ${result.drugClass}`);
  return { contraindications, warnings };
}

const nameKey = (names: string[]) =>
  names
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n !== "")
    .sort()
    .join("|");

/** True when the medicines the check covered differ from today's list. */
export function isInteractionCheckStale(check: InteractionCheck, currentMedications: string[]): boolean {
  return nameKey(check.medications) !== nameKey(currentMedications);
}
