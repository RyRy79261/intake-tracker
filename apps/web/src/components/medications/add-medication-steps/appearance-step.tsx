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
    <div className="space-y-6">
      <div className="flex justify-center py-4">
        <PillIcon shape={shape} color={color} size={80} />
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Shape</Label>
        <div className="flex gap-2 flex-wrap">
          {PILL_SHAPES.map((s) => (
            <button
              key={s.value}
              onClick={() => onFieldChange("pillShape", s.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors min-w-[60px]",
                shape === s.value
                  ? "bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:border-teal-700"
                  : "border-border hover:bg-muted"
              )}
            >
              <PillIcon shape={s.value} color={color} size={28} />
              <span className="text-[10px] font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Color</Label>
        <div className="flex gap-2 flex-wrap px-0.5 py-0.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onFieldChange("pillColor", c)}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-all",
                color === c ? "border-teal-500 scale-110" : "border-transparent hover:scale-105",
                c === "#FFFFFF" && "border-gray-300"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs">Custom:</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => onFieldChange("pillColor", e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">{color}</span>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Visual Identification Details</Label>
        <Textarea
          value={visualIdentification}
          onChange={(e) => onFieldChange("visualIdentification", e.target.value)}
          placeholder="e.g. Scored on one side, '10' imprinted on the other"
          rows={2}
        />
        <p className="text-xs text-muted-foreground mt-1">Optional. Markings, imprints, or coating details.</p>
      </div>
    </div>
  );
}
