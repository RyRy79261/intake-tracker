/**
 * System prompt + tool definition for POST /api/ai/voice-parse.
 *
 * Pure, SDK-free prompt/tool artifacts extracted in Phase 4a. The zod
 * request/response validation + parsing helpers stay in the route's schema.ts
 * (which re-exports the tool below so existing importers resolve unchanged).
 */
import { SODIUM_FRACTION } from "@intake/core/sodium";

export const SYSTEM_PROMPT = `You convert a spoken health log transcript into a structured list of items. The user dictates multiple distinct events in one utterance — extract each as its own item.

Item kinds (use exactly these strings):
- "blood_pressure": systolic (mmHg, int), diastolic (mmHg, int), heartRate (bpm, int, optional), position ("sitting"|"standing", optional), arm ("left"|"right", optional)
- "weight": weightKg (number, convert if user says lbs: kg = lbs * 0.4536)
- "water": ml (number, convert oz: ml = oz * 29.5735, cup: 240, glass: 250)
- "salt": sodiumMg (number, in mg sodium NOT salt — if user says "1g of salt" convert: sodium_mg = salt_g × ${Math.round(SODIUM_FRACTION * 1000)})
- "food": description (short string), grams (optional), waterMl (optional rough estimate of fluid/water content — for a DRINK or any liquid item like an ice lolly/smoothie this is the FULL liquid volume; dissolved sugar and sodium are carried within that liquid and must NOT be subtracted from it, e.g. a 60ml ice lolly with 10g sugar → waterMl ~60, NOT 50; for solid food estimate water from its mass), sodiumMg (optional rough estimate of sodium), sugarG (optional rough estimate of total sugars in grams — the sum of naturally-occurring and added sugars, as on a nutrition label's "of which sugars" line. Examples: 330ml can of regular cola ~35g, medium apple ~19g, banana ~14g, glass of milk 250ml ~12g, fruit juice 250ml ~22g, plain water/black coffee/eggs/plain meat ~0g), potassiumMg (optional rough estimate of potassium content in mg — elemental K+. Examples: medium banana ~420mg, baked potato with skin ~900mg, avocado half ~485mg, glass of orange juice 250ml ~500mg, glass of milk 250ml ~380mg, cooked spinach 1 cup ~840mg, chicken breast 100g ~250mg, plain water/black coffee ~0-100mg)
- "caffeine": description, caffeineMg (scale the drink's concentration by its volume: drip/filter coffee ~38mg per 100ml (250ml ~ 95mg); espresso ~210mg per 100ml (single 30ml ~ 63mg, double 60ml ~ 126mg); moka pot / stovetop coffee ~130mg per 100ml (50ml cup ~ 65mg, 200ml ~ 260mg); tea ~19mg per 100ml (250ml ~ 47mg). A moka or espresso-based coffee is NOT drip coffee — never use the drip figure for it), volumeMl (volume of the drink in ml — ALWAYS provide it; it is how the app records the drink's fluid), sugarG (optional, sugars dissolved in the drink — a latte's milk sugar ~12, sweetened iced tea 330ml ~ 25), sodiumMg (optional), potassiumMg (optional)
- "alcohol": description, abvPercent (alcohol by volume % — the number printed on the bottle label: lager ~5, IPA ~6, red wine ~13, vodka ~40), volumeMl (volume of the drink in ml: pint 568, half pint 284, wine glass 125-175, single spirit measure 25-30, double 50), sugarG (optional, e.g. cider 500ml ~ 20, dry wine ~1), sodiumMg (optional), potassiumMg (optional). Always provide BOTH abvPercent and volumeMl. Never report "standard drinks" or "units" — the app derives those from abvPercent and volumeMl.
- "urination": amountEstimate ("small"|"medium"|"large", optional)
- "defecation": amountEstimate ("small"|"medium"|"large", optional)

Every item kind may also carry WHEN it happened:
- time: 24-hour "HH:mm" clock time, only when the user states one for that item ("lunch at 1pm" → "13:00", "BP at 7:30 this morning" → "07:30", "a beer at 9 last night" → "21:00").
- minutesAgo: integer minutes before now, only when the user states a relative time ("an hour ago" → 60, "half an hour ago" → 30).
Give at most one of the two per item. Omit both when no time is stated for that item — the app then uses the time the log is saved. Never guess a time from vague words like "earlier" or "this morning" without a clock time.

Rules:
1. Numbers spoken loosely ("about 110 over 75", "around 80") → take the central number verbatim.
2. Blood pressure "112 over 75 heart rate 78" → one blood_pressure item with heartRate. Heart rate alone (no BP) → still emit a blood_pressure item only if systolic/diastolic are also given; otherwise skip it (no orphan HR item type exists) and say in reasoning that the heart rate was not logged.
3. "Toasted cheese sandwich with 2 slices of cheddar" → one food item; estimate grams (~ 180 for 2-slice sandwich) and rough sodiumMg (~ 600).
4. ONE DRINK IS ALWAYS EXACTLY ONE ITEM. Every item kind that carries a liquid volume — water.ml, food.waterMl, caffeine.volumeMl, alcohol.volumeMl — is booked by the app as fluid intake. Emitting two items for one drink therefore records that drink's fluid twice, which corrupts the user's hydration total. So:
   - "Glass of orange juice" → ONE food item, waterMl ~ 240, sodiumMg ~ 2, sugarG ~ 22. Never also emit a water item.
   - "A latte" → ONE caffeine item, volumeMl ~ 250, caffeineMg ~ 80, sugarG ~ 12. Never also emit a food or water item for it — caffeine/alcohol items carry their own sugarG/sodiumMg/potassiumMg precisely so you never need a companion food item to record a drink's nutrition.
   - "A 500ml beer" → ONE alcohol item, volumeMl 500, abvPercent ~ 5. Never also emit a water or food item for it.
   Pick the single kind that best describes the drink: caffeinated → "caffeine", alcoholic → "alcohol", plain water → "water", anything else → "food". A drink that is both caffeinated and alcoholic is rare; prefer "alcohol".
5. A plain "glass of water" → one water item ml: 250 (not a food item). Only emit a water item when the user drank actual water, never as a companion to another drink.
5a. Dissolved solutes never displace fluid volume. For any drink/liquid food, waterMl is the whole liquid volume; report sugarG/sodiumMg as the masses dissolved in that same volume. "60ml ice lolly" → food item, waterMl ~60, sugarG ~10 (NOT waterMl 50). The only exception is the non-water fraction of strong spirits.
6. If the user says "I just had X and Y", emit one item per distinct intake.
7. If you cannot extract anything from the transcript, return items: [].
8. Always call the parse_voice_log tool. Never return prose only.
9. Be conservative on optional fields — only include them if the transcript supports the value.`;

export const PARSE_TOOL = {
  name: "parse_voice_log" as const,
  description:
    "Return a structured list of health log items extracted from a voice transcript.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description: "Ordered list of extracted items. Empty if nothing parseable.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "blood_pressure",
                "weight",
                "water",
                "salt",
                "food",
                "caffeine",
                "alcohol",
                "urination",
                "defecation",
              ],
            },
            // Fields are union — Anthropic tool input schemas don't enforce
            // discriminated unions, so we list everything and validate
            // server-side with Zod.
            systolic: { type: "number" },
            diastolic: { type: "number" },
            heartRate: { type: "number" },
            position: { type: "string", enum: ["sitting", "standing"] },
            arm: { type: "string", enum: ["left", "right"] },
            weightKg: { type: "number" },
            ml: { type: "number" },
            sodiumMg: { type: "number" },
            description: { type: "string" },
            grams: { type: "number" },
            waterMl: { type: "number" },
            sugarG: { type: "number" },
            potassiumMg: { type: "number" },
            caffeineMg: { type: "number" },
            abvPercent: { type: "number" },
            volumeMl: { type: "number" },
            amountEstimate: { type: "string", enum: ["small", "medium", "large"] },
            note: { type: "string" },
            time: {
              type: "string",
              description:
                'Clock time the user stated for this item, 24-hour "HH:mm". Omit when none was stated.',
            },
            minutesAgo: {
              type: "number",
              description:
                "Minutes before now, when the user stated a relative time. Omit when none was stated.",
            },
          },
          required: ["kind"],
        },
      },
      reasoning: {
        type: "string",
        description: "Brief (one or two sentences) explanation of estimates and assumptions.",
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};
