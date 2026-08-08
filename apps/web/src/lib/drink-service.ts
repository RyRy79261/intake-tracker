import { db } from "@/lib/db";
import type { IntakeRecord, SubstanceRecord } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { standardDrinksFromAbv } from "@intake/core/alcohol";

/**
 * The single owner of liquid volume.
 *
 * Before this existed, "a drink" could be written by three different callers
 * (`addSubstanceRecord`, `addComposableEntry`, or a hand-built `intakes`
 * array), and `SubstanceRecord.volumeMl` doubled as an implicit *command* —
 * "also create a water record for me". Every caller had to decide on its own
 * whether to trip that side effect, and the invariant it protected (exactly
 * one water IntakeRecord per logged drink) lived in a comment rather than in
 * code. Two callers booking the same volume produced duplicate hydration
 * (issue #322); none booking it produced silent under-counting.
 *
 * `logDrink` removes the choice. It takes the drink's fluid volume once and
 * *derives* the water IntakeRecord from it. `volumeMl` on the SubstanceRecords
 * it writes is pure denormalised data — never a trigger. Every drink-logging
 * surface must go through here.
 *
 * Invariants guaranteed by this function:
 *  1. Exactly one water IntakeRecord per call, with `amount === volumeMl`.
 *  2. Every record it writes shares one non-null `groupId`, so the group is
 *     editable and deletable as a unit by the reconcilers.
 *  3. `amountStandardDrinks` is derived here from `abvPercent` + `volumeMl`,
 *     at one fixed precision, so it cannot drift between write paths.
 */
export interface LogDrinkInput {
  /**
   * Fluid volume of the drink in ml — the single source of truth for
   * hydration. Callers never pass their own water intake alongside this.
   */
  volumeMl: number;
  /** User-facing name of the drink ("Latte", "Pint of lager"). */
  description: string;
  /** Caffeine content in mg. Omit or 0 for a non-caffeinated drink. */
  caffeineMg?: number;
  /** Alcohol by volume %. Omit or 0 for a non-alcoholic drink. */
  abvPercent?: number;
  /** Sodium dissolved in the drink, in mg. */
  saltMg?: number;
  /** Total sugars in the drink, in grams. */
  sugarG?: number;
  /** Potassium in the drink, in mg. */
  potassiumMg?: number;
  /** `source` tag written onto the derived water IntakeRecord. */
  waterSource?: string;
  /** Provenance of the whole group (e.g. `preset:<id>`, `voice_drink`). */
  groupSource?: string;
  /** Raw user/AI input text, retained for auditability. */
  originalInputText?: string;
  timestamp?: number;
}

export interface LogDrinkResult {
  groupId: string;
  /** The one derived water record. Always present. */
  waterIntakeId: string;
  /** Every intake record written, water included. */
  intakeIds: string[];
  substanceIds: string[];
}

/** Precision for the derived `amountStandardDrinks` value, in decimal places. */
const STANDARD_DRINKS_DP = 2;

const SUGAR_SOURCE = "manual:sugar";
const POTASSIUM_SOURCE = "manual:potassium";
const SODIUM_SOURCE = "manual:sodium";

export async function logDrink(
  input: LogDrinkInput,
): Promise<ServiceResult<LogDrinkResult>> {
  if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
    return err("A drink needs a positive volume in ml");
  }

  try {
    const groupId = crypto.randomUUID();
    const ts = input.timestamp ?? Date.now();
    const fields = syncFields();
    // Postgres stores intake amounts as `integer`; a fractional value is
    // rejected by the push validator and silently dropped by the sync engine,
    // so round at the only place that mints these rows.
    const volumeMl = Math.round(input.volumeMl);
    const intakeIds: string[] = [];
    const substanceIds: string[] = [];
    const waterIntakeId = crypto.randomUUID();

    await db.transaction(
      "rw",
      [db.intakeRecords, db.substanceRecords, db._syncQueue],
      async () => {
        // ── The derived water record — invariant 1 ──
        const water: IntakeRecord = {
          id: waterIntakeId,
          type: "water",
          amount: volumeMl,
          timestamp: ts,
          source: input.waterSource ?? "drink",
          note: input.description,
          groupId,
          ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
          ...(input.originalInputText !== undefined && {
            originalInputText: input.originalInputText,
          }),
          ...fields,
        };
        await db.intakeRecords.add(water);
        await enqueueInsideTx("intakeRecords", waterIntakeId, "upsert");
        intakeIds.push(waterIntakeId);

        // ── Dissolved solutes ──
        // These never displace fluid volume: the water record above is the
        // full drink volume regardless of what is dissolved in it.
        const solutes: Array<{
          type: "salt" | "sugar" | "potassium";
          amount: number;
          source: string;
        }> = [];
        if (input.saltMg !== undefined && input.saltMg > 0) {
          solutes.push({
            type: "salt",
            amount: Math.round(input.saltMg),
            source: SODIUM_SOURCE,
          });
        }
        if (input.sugarG !== undefined && input.sugarG > 0) {
          solutes.push({
            type: "sugar",
            amount: Math.round(input.sugarG),
            source: SUGAR_SOURCE,
          });
        }
        if (input.potassiumMg !== undefined && input.potassiumMg > 0) {
          solutes.push({
            type: "potassium",
            amount: Math.round(input.potassiumMg),
            source: POTASSIUM_SOURCE,
          });
        }
        for (const solute of solutes) {
          const id = crypto.randomUUID();
          const record: IntakeRecord = {
            id,
            type: solute.type,
            amount: solute.amount,
            timestamp: ts,
            source: solute.source,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          };
          await db.intakeRecords.add(record);
          await enqueueInsideTx("intakeRecords", id, "upsert");
          intakeIds.push(id);
        }

        // ── Substances ──
        // `volumeMl` here is denormalised data describing the drink these
        // milligrams came in. It is never read as a request to create water.
        const substances: SubstanceRecord[] = [];
        if (input.caffeineMg !== undefined && input.caffeineMg > 0) {
          substances.push({
            id: crypto.randomUUID(),
            type: "caffeine",
            amountMg: Math.round(input.caffeineMg),
            volumeMl,
            description: input.description,
            source: "standalone",
            aiEnriched: false,
            timestamp: ts,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          });
        }
        if (input.abvPercent !== undefined && input.abvPercent > 0) {
          substances.push({
            id: crypto.randomUUID(),
            type: "alcohol",
            abvPercent: input.abvPercent,
            amountStandardDrinks: parseFloat(
              standardDrinksFromAbv(input.abvPercent, volumeMl).toFixed(
                STANDARD_DRINKS_DP,
              ),
            ),
            volumeMl,
            description: input.description,
            source: "standalone",
            aiEnriched: false,
            timestamp: ts,
            groupId,
            ...(input.groupSource !== undefined && { groupSource: input.groupSource }),
            ...fields,
          });
        }
        for (const record of substances) {
          await db.substanceRecords.add(record);
          await enqueueInsideTx("substanceRecords", record.id, "upsert");
          substanceIds.push(record.id);
        }
      },
    );

    schedulePush();
    return ok({ groupId, waterIntakeId, intakeIds, substanceIds });
  } catch (e) {
    return err("Failed to log drink", e);
  }
}
