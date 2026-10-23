import type { Prescription } from "@intake/types/records";
import type { InteractionResult } from "@/lib/ai-client";
import {
  NOT_ASSESSED_PREFIX,
  normalizeInteractionCheck,
  normalizeMedicineInfo,
  summarizeRows,
} from "@/lib/medicine-about";

/** What the report says about one substance, worst first. */
export type Verdict = "avoid" | "caution" | "ok";

export interface SubstanceVerdict {
  verdict: Verdict;
  /** One blunt line: what to do and why. */
  line: string;
  /** The user's medicines it clashes with (AVOID or CAUTION). */
  clashes: string[];
}

/** The verdict of one interaction-check answer. */
export function verdictOf(result: InteractionResult): SubstanceVerdict {
  const rows = result.interactions.map((i) => ({
    medication: i.medication,
    severity: i.severity,
    description: i.description,
    ...(i.description.startsWith(NOT_ASSESSED_PREFIX) && { notAssessed: true }),
  }));
  const verdict: Verdict = rows.some((r) => r.severity === "AVOID")
    ? "avoid"
    : rows.some((r) => r.severity === "CAUTION")
      ? "caution"
      : "ok";
  return {
    verdict,
    line: result.summary?.trim() || summarizeRows(rows),
    clashes: [...new Set(rows.filter((r) => r.severity !== "OK").map((r) => r.medication))],
  };
}

/** The report's one-line answer over every checked substance. */
export function reportHeadline(results: { name: string; verdict: Verdict }[]): string {
  const avoid = results.filter((r) => r.verdict === "avoid").map((r) => r.name);
  if (avoid.length > 0) return `Do not take ${joinOr(avoid)}`;
  if (results.some((r) => r.verdict === "caution")) return "Careful. Read each one below.";
  return results.length === 1 ? "OK to take" : "OK to take all of these";
}

function joinOr(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export interface SavedCaution {
  text: string;
  /** The medicine (or pair) the note was saved on. */
  from: string;
}

/**
 * "What can't I take?": the notes already saved on the active prescriptions,
 * from "About this medicine" (when not to take it, warnings) and from the
 * last interaction check between the user's own medicines. No AI call.
 */
export function savedCautions(prescriptions: Prescription[]): {
  avoid: SavedCaution[];
  careful: SavedCaution[];
} {
  const avoid: SavedCaution[] = [];
  const careful: SavedCaution[] = [];
  const seen = new Set<string>();
  const push = (list: SavedCaution[], text: string, from: string) => {
    const key = `${from}|${text}`.toLowerCase();
    if (!text.trim() || seen.has(key)) return;
    seen.add(key);
    list.push({ text: text.trim(), from });
  };

  for (const rx of prescriptions.filter((p) => p.isActive && !p.deletedAt)) {
    const info = normalizeMedicineInfo(rx.medicineInfo);
    const check = normalizeInteractionCheck(rx.interactionCheck);
    for (const c of info?.contraindications ?? []) push(avoid, c, rx.genericName);
    for (const w of info?.warnings ?? []) {
      push(careful, w.whatToDo ? `${w.risk} ${w.whatToDo}` : w.risk, rx.genericName);
    }
    for (const row of check?.rows ?? []) {
      if (row.severity === "OK" || row.notAssessed) continue;
      // Each pair is checked from both sides: show it once.
      const pair = [rx.genericName, row.medication].map((n) => n.trim().toLowerCase()).sort().join("+");
      if (seen.has(pair)) continue;
      seen.add(pair);
      push(row.severity === "AVOID" ? avoid : careful, row.description, `${rx.genericName} + ${row.medication}`);
    }
    // Older records hold only the flat strings.
    if (!info && !check) {
      for (const c of rx.contraindications ?? []) push(avoid, c, rx.genericName);
      for (const w of rx.warnings ?? []) {
        if (!w.startsWith("Drug class:")) push(careful, w, rx.genericName);
      }
    }
  }
  return { avoid, careful };
}
