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
 *
 * @see reconcileLiquidItems
 */

/** Volume tolerance for treating a food item as the same drink (fraction). */
const VOLUME_TOLERANCE = 0.25;

/**
 * Looser tolerance for *flagging* a pairing that is not merged. A companion
 * carrying only the milk of a latte (250 ml of a 350 ml drink) is outside the
 * merge tolerance but still worth putting in front of the user.
 */
const WARNING_VOLUME_TOLERANCE = 0.5;

/** Words that carry no identifying signal when comparing two descriptions. */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "with", "and", "some", "my", "one", "two",
  "glass", "cup", "mug", "can", "bottle", "pint", "half", "double", "single",
  "ml", "l", "litre", "liter", "oz", "ounce", "shot", "measure", "small",
  "medium", "large", "regular", "had", "drank", "i", "was", "it",
]);

/**
 * Ingredient / mixer words. A description made only of these names a part of
 * a drink ("milk", "tonic"), not a drink of its own, so sharing one of them is
 * not evidence that two items are the same drink: "coffee with milk" and "a
 * glass of milk" share "milk" and are two drinks.
 */
const COMPONENT_WORDS = new Set([
  "milk", "cream", "sugar", "syrup", "water", "juice", "ice", "foam", "honey",
  "oat", "soy", "almond", "tonic", "soda", "lemon", "lime", "mixer",
]);

/**
 * A description that names a serving vessel ("a glass of milk", "a can of
 * coke") describes a drink served on its own — not a nutrition companion the
 * parser split off another drink.
 */
const CONTAINER_PATTERN =
  /\b(glass(es)?|cups?|mugs?|cans?|bottles?|cartons?|jugs?|flasks?|pints?)\b/;

/** Fold a simple plural ("lattes", "beers") onto its singular. */
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
    ? token.slice(0, -1)
    : token;
}

/** Identifying words of a description, lowercased with stopwords removed. */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
      .map(stem),
  );
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (!b.has(token)) return false;
  }
  return true;
}

function namesContainer(description: string): boolean {
  return CONTAINER_PATTERN.test(description.toLowerCase());
}

/**
 * True when a food item's description identifies the same drink as a
 * caffeine/alcohol item's — strong enough to merge on.
 *
 * One shared word is not enough ("coffee with milk" vs "a glass of milk",
 * "coffee" vs "coffee milkshake"). The food's identifying words must equal the
 * drink's, or be a subset of them ("latte" inside "iced oat latte") that still
 * contains a real drink word rather than only an ingredient, and does not name
 * a serving vessel of its own.
 */
function describesSameDrink(drinkDescription: string, foodDescription: string): boolean {
  const drinkTokens = tokenize(drinkDescription);
  const foodTokens = tokenize(foodDescription);
  if (drinkTokens.size === 0 || foodTokens.size === 0) return false;
  if (!isSubset(foodTokens, drinkTokens)) return false;
  if (foodTokens.size === drinkTokens.size) return true;
  if (namesContainer(foodDescription)) return false;
  return [...foodTokens].some((t) => !COMPONENT_WORDS.has(t));
}

/**
 * True when a food item that is NOT merged still looks like it might be part
 * of the drink, so the pairing is flagged for the user instead of passing
 * silently: it shares a real drink word with the drink ("latte" / "latte
 * milk"), or it names only an ingredient ("milk" next to a flat white). A food
 * item that names its own vessel ("a glass of milk") was dictated as a drink
 * of its own and is left alone.
 */
function looksLikeCompanion(drinkDescription: string, foodDescription: string): boolean {
  if (namesContainer(foodDescription)) return false;
  const drinkTokens = tokenize(drinkDescription);
  const foodTokens = tokenize(foodDescription);
  if (foodTokens.size === 0) return false;
  const sharesDrinkWord = [...foodTokens].some(
    (t) => drinkTokens.has(t) && !COMPONENT_WORDS.has(t),
  );
  const onlyComponents = [...foodTokens].every((t) => COMPONENT_WORDS.has(t));
  return sharesDrinkWord || onlyComponents;
}

/** True when two volumes are within `tolerance` (a fraction) of each other. */
function volumesComparable(a: number, b: number, tolerance = VOLUME_TOLERANCE): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= Math.max(a, b) * tolerance;
}

type DrinkItem = Extract<VoiceParsedItem, { kind: "caffeine" | "alcohol" }>;

/** A caffeine or alcohol item — the kinds that describe a complete drink. */
function isDrink(item: VoiceParsedItem): item is DrinkItem {
  return item.kind === "caffeine" || item.kind === "alcohol";
}

/** A drink's fluid volume in ml, or 0 when the parser omitted it. */
function drinkVolume(item: DrinkItem): number {
  return item.volumeMl ?? 0;
}

/**
 * The food value fills a drink solute that is missing — or an explicit 0,
 * which the parser emits for "none stated" and which would otherwise discard
 * the companion's real value (the reason the companion was emitted at all).
 */
function fillSolute(
  drinkValue: number | undefined,
  foodValue: number | undefined,
): number | undefined {
  if ((drinkValue === undefined || drinkValue === 0) && foodValue !== undefined && foodValue > 0) {
    return foodValue;
  }
  return drinkValue;
}

/** A note about specific rows of the reconciled list. */
export interface ReconcileNote {
  message: string;
  /** Indices into {@link ReconcileResult.items} that the note concerns. */
  itemIndices: number[];
}

/** Outcome of {@link reconcileLiquidItems}. */
export interface ReconcileResult {
  items: VoiceParsedItem[];
  /** One note per merge, anchored to the drink row that absorbed a companion. */
  merges: ReconcileNote[];
  /**
   * Ambiguous pairings left intact for the user to resolve in the review list,
   * anchored to both rows. Nothing has been dropped.
   */
  warnings: ReconcileNote[];
}

/**
 * Collapse one dictated drink that the parser split across two items, so its
 * fluid is booked once rather than twice (issue #322).
 *
 * Merges only unambiguous pairings — the same drink name (see
 * {@link describesSameDrink}) AND a comparable volume. A suspicious-but-
 * uncertain pairing (a bare water item of about the drink's volume, or a food
 * item that looks like part of the drink) is reported in `warnings` with both
 * items left intact, because silently dropping fluid the user really drank is
 * worse than the duplicate it would prevent.
 *
 * Pure: the input array is not mutated.
 *
 * @param items Parsed voice items, in the order the model emitted them.
 * @returns The reconciled items, notes describing each merge performed, and
 *   warnings for pairings a human needs to resolve. Note indices refer to the
 *   returned `items`.
 */
export function reconcileLiquidItems(
  items: VoiceParsedItem[],
): ReconcileResult {
  // Notes are collected against input indices and remapped once the absorbed
  // items are filtered out.
  const merges: { message: string; indices: number[] }[] = [];
  const warnings: { message: string; indices: number[] }[] = [];
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
    let suspect = -1;
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
      if (
        describesSameDrink(drink.description, candidate.description) &&
        volumesComparable(waterMl, volume)
      ) {
        companion = j;
        break;
      }
      if (
        suspect === -1 &&
        !flagged.has(j) &&
        looksLikeCompanion(drink.description, candidate.description) &&
        volumesComparable(waterMl, volume, WARNING_VOLUME_TOLERANCE)
      ) {
        suspect = j;
      }
    }

    if (companion !== -1) {
      const food = result[companion] as FoodItem;
      // The drink's own values win; the food item fills the gaps.
      const merged: DrinkItem = { ...drink };
      const sugarG = fillSolute(drink.sugarG, food.sugarG);
      const sodiumMg = fillSolute(drink.sodiumMg, food.sodiumMg);
      const potassiumMg = fillSolute(drink.potassiumMg, food.potassiumMg);
      if (sugarG !== undefined) merged.sugarG = sugarG;
      if (sodiumMg !== undefined) merged.sodiumMg = sodiumMg;
      if (potassiumMg !== undefined) merged.potassiumMg = potassiumMg;
      result[i] = merged;
      absorbed.add(companion);
      merges.push({
        message: `Merged the separate "${food.description}" food entry into the ${drink.description} — one drink, one fluid amount.`,
        indices: [i],
      });
      continue;
    }

    if (suspect !== -1) {
      const food = result[suspect] as FoodItem;
      flagged.add(suspect);
      warnings.push({
        message: `The "${food.description}" entry (${food.waterMl} ml) may be part of the ${drink.description} — if it is the same drink, reject one of the two.`,
        indices: [i, suspect],
      });
      continue;
    }

    // ── A bare `water` item of about the same volume ──
    // This is NOT merged. "A 500 ml beer and 500 ml of water" is a perfectly
    // ordinary thing to dictate, and there is nothing in a bare water item to
    // tell that apart from a redundant companion the parser invented. Dropping
    // it silently would lose fluid the user actually drank — unrecoverably,
    // since the row would never reach the review list. Instead both rows are
    // flagged, and the user resolves it by rejecting one.
    for (let j = 0; j < result.length; j++) {
      if (absorbed.has(j) || flagged.has(j)) continue;
      const candidate = result[j];
      if (!candidate || candidate.kind !== "water") continue;
      const water = candidate as WaterItem;
      if (water.note !== undefined) continue;
      if (!volumesComparable(water.ml, volume)) continue;
      flagged.add(j);
      warnings.push({
        message: `A ${water.ml} ml water entry matches the ${drink.description} — if that is the same drink, reject one of the two.`,
        indices: [i, j],
      });
      break;
    }
  }

  // Map input indices onto the filtered list.
  const newIndex = new Map<number, number>();
  let next = 0;
  for (let index = 0; index < result.length; index++) {
    if (!absorbed.has(index)) newIndex.set(index, next++);
  }
  const anchor = (note: { message: string; indices: number[] }): ReconcileNote => ({
    message: note.message,
    itemIndices: note.indices
      .map((index) => newIndex.get(index))
      .filter((index): index is number => index !== undefined),
  });

  return {
    items: result.filter((_, index) => !absorbed.has(index)),
    merges: merges.map(anchor),
    warnings: warnings.map(anchor),
  };
}
