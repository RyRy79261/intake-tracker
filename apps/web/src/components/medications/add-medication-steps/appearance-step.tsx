"use client";

import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import { PillIcon } from "@/components/medications/pill-icon";
import { cn } from "@/lib/utils";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import { type FieldChange, PILL_SHAPES, PRESET_COLORS } from "@/components/medications/add-medication-steps/types";

export function AppearanceStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { pillShape: shape, pillColor: color, visualIdentification } = formState;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex min-h-14 items-center gap-3 border border-line bg-background px-2.5 py-2 font-semibold">
        <PillIcon shape={shape} color={color} size={44} />
        <span>{formState.brandName || formState.genericName || "Your pill"}</span>
      </div>

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Shape</Label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Shape">
          {PILL_SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={shape === s.value}
              onClick={() => onFieldChange("pillShape", s.value)}
              className={cn(
                "flex min-h-[60px] flex-col items-center justify-center gap-1 border text-[0.8125rem]",
                shape === s.value ? "border-foreground bg-foreground text-background" : "border-line hover:bg-foreground/6",
              )}
            >
              <PillIcon shape={s.value} color={color} size={24} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Colour</Label>
        <div className="flex flex-wrap gap-2 p-0.5" role="radiogroup" aria-label="Colour">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => onFieldChange("pillColor", c)}
              className={cn(
                "h-11 w-11 border border-[#5E5A70]",
                color === c && "shadow-[0_0_0_2px_hsl(var(--panel)),0_0_0_4px_hsl(var(--fg))]",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-[0.8125rem] font-normal text-muted-foreground">Custom:</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => onFieldChange("pillColor", e.target.value)}
            aria-label="Custom colour"
            className="h-10 w-10 cursor-pointer border border-line bg-transparent"
          />
          <span className="font-mono text-xs text-muted-foreground">{color}</span>
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Markings (optional)</Label>
        <Textarea
          value={visualIdentification}
          onChange={(e) => onFieldChange("visualIdentification", e.target.value)}
          placeholder="e.g. Scored on one side, '10' imprinted on the other"
          rows={2}
        />
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">Imprints, a score line or coating details.</p>
      </div>
    </div>
  );
}
