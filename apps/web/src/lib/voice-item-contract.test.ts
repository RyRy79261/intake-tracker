import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  VOICE_ITEM_KINDS,
  VOICE_ITEM_SPEC,
  voiceItemProblem,
  voiceToolItemProperties,
  type NumberFieldSpec,
  type VoiceFieldSpec,
  type VoiceItemKind,
} from "@intake/core/voice-items";
import { extractVoiceItems } from "@/app/api/ai/voice-parse/schema";
import { PARSE_TOOL } from "@intake/ai-prompts/voice-parse";
import { validateVoiceItem } from "@/lib/voice-validation";
import type { VoiceParsedItem } from "@/lib/voice-types";

/**
 * The seam between the route and the review row: an item the route returns
 * must pass the review check, so the user never gets a row they cannot save
 * for a reason the route already knew about.
 */

const fields = (kind: VoiceItemKind) =>
  Object.entries(VOICE_ITEM_SPEC[kind] as Record<string, VoiceFieldSpec>);

/** A full item of `kind` with every number field at `pick` of its range. */
function itemAt(kind: VoiceItemKind, pick: (f: NumberFieldSpec) => number): Record<string, unknown> {
  const item: Record<string, unknown> = { kind };
  for (const [name, field] of fields(kind)) {
    if (field.type === "number") item[name] = pick(field);
    else if (field.type === "choice") item[name] = field.values[0];
    // A text with a shape (a dose time) gets the latest value it allows.
    else item[name] = field.pattern ? "23:59" : "x".repeat(field.maxLength);
  }
  return item;
}

function routeOutput(raw: Record<string, unknown>): VoiceParsedItem[] {
  const result = extractVoiceItems({ items: [raw], reasoning: "" });
  return result.ok ? (result.items as VoiceParsedItem[]) : [];
}

describe("voice item contract: route output passes the review check", () => {
  for (const kind of VOICE_ITEM_KINDS) {
    it(`${kind}: at the bottom and the top of every range`, () => {
      for (const pick of [(f: NumberFieldSpec) => f.min, (f: NumberFieldSpec) => f.max]) {
        const out = routeOutput(itemAt(kind, pick));
        expect(out).toHaveLength(1);
        expect(validateVoiceItem(out[0]!)).toBeNull();
      }
    });

    it(`${kind}: with only its required fields`, () => {
      const raw: Record<string, unknown> = { kind };
      for (const [name, field] of fields(kind)) {
        if (!field.required) continue;
        raw[name] = field.type === "number" ? field.max : field.type === "choice" ? field.values[0] : "x";
      }
      const out = routeOutput(raw);
      expect(out).toHaveLength(1);
      const askOnReview = fields(kind).some(([, f]) => f.requiredOnReview);
      // A field only the review asks for is the one expected failure.
      expect(validateVoiceItem(out[0]!) === null).toBe(!askOnReview);
    });

    it(`${kind}: one step outside a range is refused by both sides`, () => {
      for (const [name, field] of fields(kind)) {
        if (field.type !== "number") continue;
        for (const value of [field.min - 1, field.max + 1]) {
          const raw = { ...itemAt(kind, (f) => f.max), [name]: value };
          // The route drops it...
          expect(routeOutput(raw)).toHaveLength(0);
          // ...and a user edit to the same value cannot be saved.
          expect(voiceItemProblem(raw as never)).toMatch(new RegExp(field.label));
        }
      }
    });
  }

  it("asks for a urination amount the model left out", () => {
    const out = routeOutput({ kind: "urination" });
    expect(out).toHaveLength(1);
    expect(validateVoiceItem(out[0]!)).toBe("Pick an amount.");
  });

  it("drops a blank description on the route, as the review would refuse it", () => {
    expect(routeOutput({ kind: "food", description: "   " })).toHaveLength(0);
    expect(voiceItemProblem({ kind: "food", description: "   " })).toMatch(/description/i);
  });
});

describe("voice item contract: tool schema", () => {
  it("offers the model the same item fields as before the contract", () => {
    // What the parse tool listed by hand before it was derived. Changing the
    // spec changes this list, so this test is where that shows.
    expect(voiceToolItemProperties()).toEqual({
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
          "scheduled_dose",
          "stock_refill",
          "extra_medicine",
        ],
      },
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
      slotTime: { type: "string" },
      medicine: { type: "string" },
      action: { type: "string", enum: ["taken", "skipped", "not_taken"] },
      pills: { type: "number" },
      amount: { type: "number" },
      unit: { type: "string", enum: ["mg", "mcg", "g", "ml", "tablet", "capsule"] },
    });
  });

  it("gives a field shared by several kinds one type", () => {
    const seen = new Map<string, string>();
    for (const kind of VOICE_ITEM_KINDS) {
      for (const [name, field] of fields(kind)) {
        const type = field.type === "choice" ? `choice:${field.values.join()}` : field.type;
        expect(seen.get(name) ?? type).toBe(type);
        seen.set(name, type);
      }
    }
  });

  it("puts the derived fields into the parse tool", () => {
    const props = PARSE_TOOL.input_schema.properties.items.items.properties;
    for (const name of Object.keys(voiceToolItemProperties())) expect(props).toHaveProperty(name);
  });
});

describe("voice item contract: layering", () => {
  it("the route's schema imports no client code", () => {
    const source = readFileSync(
      join(__dirname, "../app/api/ai/voice-parse/schema.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from "@\/(lib|components|hooks|stores)\//);
  });
});
