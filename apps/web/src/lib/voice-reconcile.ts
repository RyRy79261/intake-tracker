import type { VoiceParsedItem, FoodItem, WaterItem } from "@/lib/voice-types";

/**
 * Collapse a drink that the parser split across two items.
 *
 * Every voice item kind that carries a liquid volume — `water.ml`,
 * `food.waterMl`, `caffeine.volumeMl`, `alcohol.volumeMl` — is booked as fluid
 * intake. One dictated drink arriving as two items therefore records its fluid
 * twice, which is issue #322: "a latte" came back as a `caffeine` item *and* a
 * `food` item (the parser had no other way to record the milk sugar), and both
 * volumes landed as water.
 *
 * The prompt now forbids that shape and drinks carry their own solute fields,
 * but a prompt rule is a request, not a guarantee. This function is the
 * deterministic backstop, and it runs on the parse result *before* the review
 * list is rendered — so the user sees and approves one row per drink rather
 * than having a silent correction applied underneath them at save time.
 *
 * Deliberately conservative: it only merges when the pairing is unambiguous —
 * same name AND a comparable volume. Wrongly dropping a companion item loses
 * real hydration the user actually drank, silently and unrecoverably, which is
 * worse than the duplicate it would have prevented. Pairings that are merely
 * suspicious are reported in `warnings` with both rows left intact, for the
 * user to resolve by rejecting one in the review list.
 */

/** Volume tolerance for treating a food item as the same drink (fraction). */
const VOLUME_TOLERANCE = 0.25;

/** Words that carry no identifying signal when comparing two descriptions. */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "with", "and", "some", "my", "one", "two",
  "glass", "cup", "mug", "can", "bottle", "pint", "half", "double", "single",
  "ml", "l", "litre", "liter", "oz", "ounce", "shot", "measure", "small",
  "medium", "large", "regular", "had", "drank", "i", "was", "it",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

/** True when two descriptions share at least one identifying word. */
function describesSameThing(a: string, b: string): boolean {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  for (const token of tokensA) {
    if (tokensB.has(token)) return true;
  }
  return false;
}

function volumesComparable(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= Math.max(a, b) * VOLUME_TOLERANCE;
}

type DrinkItem = Extract<VoiceParsedItem, { kind: "caffeine" | "alcohol" }>;

function isDrink(item: VoiceParsedItem): item is DrinkItem {
  return item.kind === "caffeine" || item.kind === "alcohol";
}

function drinkVolume(item: DrinkItem): number {
  return item.volumeMl ?? 0;
}

export interface ReconcileResult {
  items: VoiceParsedItem[];
  /** One human-readable note per merge, surfaced in the review panel. */
  merges: string[];
  /**
   * Ambiguous pairings left intact for the user to resolve in the review list.
   * Surfaced alongside `merges`; nothing has been dropped.
   */
  warnings: string[];
}

export function reconcileLiquidItems(
  items: VoiceParsedItem[],
): ReconcileResult {
  const merges: string[] = [];
  const warnings: string[] = [];
  // Indices consumed by a merge — dropped from the returned list.
  const absorbed = new Set<number>();
  // Indices already named in a warning — kept, but not flagged twice.
  const flagged = new Set<number>();
  const result = items.map((item) => ({ ...item }) as VoiceParsedItem);

  for (let i = 0; i < result.length; i++) {
    const drink = result[i];
    if (!drink || !isDrink(drink) || absorbed.has(i)) continue;
    const volume = drinkVolume(drink);
    if (volume <= 0) continue;

    // ── Preferred companion: a `food` item describing the same drink ──
    // This is the shape #322 actually produces. Merging it keeps the food
    // item's nutrition (which is why the parser emitted it) and keeps a
    // single volume.
    let companion = -1;
    for (let j = 0; j < result.length; j++) {
      if (j === i || absorbed.has(j)) continue;
      const candidate = result[j];
      if (!candidate || candidate.kind !== "food") continue;
      const waterMl = candidate.waterMl ?? 0;
      if (waterMl <= 0) continue;
      // The name match is required, not an alternative to the volume match.
      // Matching on volume alone merged genuinely distinct drinks: "a coffee
      // and a glass of milk" both come back at 250 ml, because that is the
      // figure the prompt gives for "glass" and "cup" alike — so the milk was
      // absorbed, its 250 ml of real hydration lost and its sugar grafted onto
      // the coffee.
      const sameDrink =
        describesSameThing(drink.description, candidate.description) &&
        (waterMl === volume || volumesComparable(waterMl, volume));
      if (sameDrink) {
        companion = j;
        break;
      }
    }

    if (companion !== -1) {
      const food = result[companion] as FoodItem;
      // The drink's own values win; the food item fills the gaps.
      const merged: DrinkItem = { ...drink };
      if (merged.sugarG === undefined && food.sugarG !== undefined) {
        merged.sugarG = food.sugarG;
      }
      if (merged.sodiumMg === undefined && food.sodiumMg !== undefined) {
        merged.sodiumMg = food.sodiumMg;
      }
      if (merged.potassiumMg === undefined && food.potassiumMg !== undefined) {
        merged.potassiumMg = food.potassiumMg;
      }
      result[i] = merged;
      absorbed.add(companion);
      merges.push(
        `Merged the separate "${food.description}" food entry into the ${drink.description} — one drink, one fluid amount.`,
      );
      continue;
    }

    // ── A bare `water` item of exactly the same volume ──
    // This is NOT merged. "A 500 ml beer and 500 ml of water" is a perfectly
    // ordinary thing to dictate, and there is nothing in a bare water item to
    // tell that apart from a redundant companion the parser invented. Dropping
    // it silently would lose fluid the user actually drank — unrecoverably,
    // since the row would never reach the review list. Instead it is flagged,
    // and the user resolves it by rejecting a row: the review list already
    // requires per-row approval, so nothing is written without their say.
    for (let j = 0; j < result.length; j++) {
      if (absorbed.has(j) || flagged.has(j)) continue;
      const candidate = result[j];
      if (!candidate || candidate.kind !== "water") continue;
      const water = candidate as WaterItem;
      if (water.ml !== volume || water.note !== undefined) continue;
      flagged.add(j);
      warnings.push(
        `A ${water.ml} ml water entry matches the ${drink.description} exactly — if that is the same drink, reject one of the two.`,
      );
      break;
    }
  }

  return {
    items: result.filter((_, index) => !absorbed.has(index)),
    merges,
    warnings,
  };
}
