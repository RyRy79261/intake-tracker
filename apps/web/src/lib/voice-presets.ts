import type { LiquidPreset } from "@/lib/constants";
import type { VoiceParsedItem } from "@/lib/voice-types";
import { tokenize, type ReconcileNote } from "@/lib/voice-reconcile";

/**
 * Align voice caffeine estimates with the user's liquid presets.
 *
 * The preset path books a drink from its stored mg-per-100 ml; the voice path
 * asked the model for an absolute figure, so the same 200 ml moka came out at
 * ~134 mg by voice and ~314 mg by preset. When a voice caffeine drink names a
 * preset, the preset's concentration × the spoken volume wins, and the row is
 * told where the number came from.
 */

interface PresetMatch {
  preset: LiquidPreset;
  /** Preset name words found in the description. */
  size: number;
  /** Position of the first matched word — earlier modifiers are more specific. */
  position: number;
}

function findPreset(description: string, presets: LiquidPreset[]): LiquidPreset | undefined {
  const words = [...tokenize(description)];
  let best: PresetMatch | undefined;
  for (const preset of presets) {
    if (preset.tab !== "coffee" || preset.caffeinePer100ml === undefined) continue;
    const name = [...tokenize(preset.name)];
    if (name.length === 0 || !name.every((w) => words.includes(w))) continue;
    const position = Math.min(...name.map((w) => words.indexOf(w)));
    // More matched words wins ("cold brew" over "brew"); on a tie the word
    // said first is the modifier ("moka coffee" is a moka). A full tie goes to
    // the user's own preset over a stock default of the same name.
    if (
      !best ||
      name.length > best.size ||
      (name.length === best.size && position < best.position) ||
      (name.length === best.size &&
        position === best.position &&
        best.preset.isDefault &&
        !preset.isDefault)
    ) {
      best = { preset, size: name.length, position };
    }
  }
  return best?.preset;
}

/**
 * Replace each caffeine item's `caffeineMg` with the matching preset's
 * concentration × its volume. Items without a volume or a matching preset are
 * left as parsed. Pure.
 */
export function applyPresetCaffeine(
  items: VoiceParsedItem[],
  presets: LiquidPreset[],
): { items: VoiceParsedItem[]; notes: ReconcileNote[] } {
  const notes: ReconcileNote[] = [];
  const next = items.map((item, index) => {
    if (item.kind !== "caffeine" || item.volumeMl === undefined || item.volumeMl <= 0) {
      return item;
    }
    const preset = findPreset(item.description, presets);
    if (!preset || preset.caffeinePer100ml === undefined) return item;
    const caffeineMg = Math.round((preset.caffeinePer100ml * item.volumeMl) / 100);
    if (caffeineMg === item.caffeineMg) return item;
    notes.push({
      message: `Caffeine from your "${preset.name}" preset (${preset.caffeinePer100ml} mg per 100 ml) instead of the estimate of ${item.caffeineMg} mg.`,
      itemIndices: [index],
    });
    return { ...item, caffeineMg };
  });
  return { items: next, notes };
}
