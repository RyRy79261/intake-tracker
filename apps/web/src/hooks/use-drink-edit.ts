"use client";

import { useRef, useState } from "react";
import { useToast } from "@intake/ui/use-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useDrink, fetchDrink, type DrinkKind, type EditDrinkInput } from "@/hooks/use-drink";
import { useSettings } from "@/hooks/use-settings";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import type { IntakeRecord } from "@/lib/db";

/** The text of each drink field, as typed. */
export interface DrinkEditFieldValues {
  amount: string;
  name: string;
  caffeineMg: string;
  abvPercent: string;
  sugarG: string;
}

const EMPTY: DrinkEditFieldValues = {
  amount: "",
  name: "",
  caffeineMg: "",
  abvPercent: "",
  sugarG: "",
};

/**
 * Read a caffeine/ABV/sugar field for {@link EditDrinkInput}. A field the user
 * did not change is left out, so the amount follows the volume. A cleared
 * field removes the substance, but only when it held a value: the prefill is
 * async, so a blank field may just not have loaded yet.
 */
function readField(text: string, prefilled: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === prefilled) return undefined;
  if (trimmed === "") return 0;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The drink edit form: the Liquids card's inline form and the Records tab's
 * dialog both use it. It fills the fields from the Drink module and sends one
 * {@link EditDrinkInput} back to it.
 */
export function useDrinkEdit() {
  const { toast } = useToast();
  const settings = useSettings();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const drink = useDrink();

  const [values, setValues] = useState<DrinkEditFieldValues>(EMPTY);
  const [kind, setKind] = useState<DrinkKind>("drink");
  // What the fields held when the drink loaded (see readField).
  const prefilledRef = useRef<DrinkEditFieldValues>(EMPTY);
  // The name the form was filled with. A change to it relabels the row,
  // unless the user typed their own note.
  const openedNameRef = useRef("");
  // Discards a slow fetch for a record that is no longer open.
  const openTokenRef = useRef(0);

  const setField = (field: keyof DrinkEditFieldValues, value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const edit = useEditRecord<IntakeRecord>({
    onOpen: (record) => {
      const token = ++openTokenRef.current;
      const source = record.source ?? "";
      let name = "";
      if (source.startsWith("beverage:")) {
        name = source.slice("beverage:".length);
      } else if (source.startsWith("preset:")) {
        // The name only. Substance values come from the stored records:
        // the preset's current values could bring back a cleared one.
        const preset = settings.liquidPresets.find(
          (p) => p.id === source.slice("preset:".length),
        );
        name = preset?.name ?? record.note ?? "";
      }
      const opened = { ...EMPTY, amount: record.amount.toString(), name };
      openedNameRef.current = name;
      prefilledRef.current = opened;
      setValues(opened);
      setKind(record.source === "manual:food_water_content" ? "meal-water" : "drink");

      void fetchDrink(record.id)
        .then((snapshot) => {
          if (token !== openTokenRef.current || !snapshot) return;
          setKind(snapshot.kind);
          if (snapshot.kind !== "drink") return;
          const loaded: DrinkEditFieldValues = {
            amount: snapshot.volumeMl.toString(),
            name: snapshot.description ?? name,
            caffeineMg: snapshot.caffeineMg?.toString() ?? "",
            abvPercent:
              snapshot.abvPercent !== undefined
                ? parseFloat(snapshot.abvPercent.toFixed(1)).toString()
                : "",
            sugarG: snapshot.sugarG?.toString() ?? "",
          };
          openedNameRef.current = loaded.name;
          prefilledRef.current = loaded;
          // Keep anything the user typed before the drink loaded.
          setValues((current) => {
            const next = { ...loaded };
            for (const key of Object.keys(next) as Array<keyof DrinkEditFieldValues>) {
              if (current[key] !== opened[key]) next[key] = current[key];
            }
            return next;
          });
        })
        .catch(() => {
          // Leave the fields as opened. An unloaded field reads as unchanged.
        });
    },
    buildUpdates: (timestamp, note) => {
      // Number, not parseInt: parseInt read "1e3" as 1 ml.
      const volumeMl = Number(values.amount.trim());
      if (values.amount.trim() === "" || !Number.isFinite(volumeMl) || volumeMl <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return null;
      }
      if (!Number.isInteger(volumeMl)) {
        toast({
          title: "Invalid amount",
          description: "Enter the amount as a whole number of ml.",
          variant: "destructive",
        });
        return null;
      }
      const record = edit.editingRecord;
      const updates: EditDrinkInput = { volumeMl, timestamp, note };
      const name = values.name.trim();
      const source = record?.source ?? "";
      if (source.startsWith("beverage:") || source === "beverage") {
        // A plain beverage is named by its source tag.
        updates.waterSource = name ? `beverage:${name}` : "beverage";
      } else if (kind === "drink") {
        // Any other drink is labelled by its note, so a rename reaches the
        // note, unless the user changed the note in this edit.
        const originalNote = (record?.note ?? "").trim();
        const noteUntouched = (note ?? "") === originalNote;
        const noteIsName = originalNote === "" || originalNote === openedNameRef.current.trim();
        if (name && name !== openedNameRef.current.trim() && noteUntouched && noteIsName) {
          updates.note = name;
        }
      }
      if (kind !== "drink") return updates;

      if (name) updates.description = name;
      const prefilled = prefilledRef.current;
      const caffeineMg = readField(values.caffeineMg, prefilled.caffeineMg);
      const abvPercent = readField(values.abvPercent, prefilled.abvPercent);
      const sugarG = sugarEnabled ? readField(values.sugarG, prefilled.sugarG) : undefined;
      if (caffeineMg !== undefined) updates.caffeineMg = caffeineMg;
      if (abvPercent !== undefined) updates.abvPercent = abvPercent;
      if (sugarG !== undefined) updates.sugarG = sugarG;
      return updates;
    },
    mutateAsync: ({ id, updates }) => drink.edit(id, updates as EditDrinkInput),
  });

  return { ...edit, values, setField, kind, sugarEnabled };
}

export type DrinkEditForm = ReturnType<typeof useDrinkEdit>;
