"use client";

import type { ReactNode } from "react";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import type { Prescription, CompoundStrength } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { MedicineStrengthOption } from "@/hooks/use-medicine-search";
import { cn } from "@/lib/utils";
import { compoundSum, formatCompoundShort } from "@intake/core/compound";
import type { FieldChange } from "@/components/medications/add-medication-steps/types";

export function SearchStep({
  formState, onFieldChange, errors,
  existingPrescriptions, onSelectPrescription,
  lookup,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
  errors: Record<string, string>;
  existingPrescriptions: Prescription[];
  onSelectPrescription: (id: string) => void;
  /** The AI medicine lookup panel (sign-in gated by the panel itself). */
  lookup?: ReactNode;
}) {
  const {
    searchResult: result, brandName, genericName,
    dosageStrength, selectedPrescriptionId, isCombination, compounds,
  } = formState;

  const setCompound = (index: number, patch: Partial<CompoundStrength>) => {
    const next = compounds.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onFieldChange("compounds", next);
  };

  // Combination strength presets from AI search (options with ≥ 2 ingredients).
  const comboOptions: MedicineStrengthOption[] = (result?.strengthOptions ?? [])
    .filter((o) => o.compounds.length >= 2);

  const applyComboOption = (option: MedicineStrengthOption) => {
    onFieldChange(
      "compounds",
      option.compounds.map((c) => ({ name: c.name, strength: c.strength })),
    );
  };

  const comboTotal = compoundSum(compounds);

  return (
    <div className="flex flex-col gap-3.5">
      {existingPrescriptions.length > 0 && (
        <div>
          <Label className="text-[0.8125rem] font-normal text-muted-foreground mb-1 block">Assign to prescription</Label>
          <select
            className="flex h-10 w-full rounded-none border border-input bg-background px-2.5 text-[0.9375rem] text-foreground"
            value={selectedPrescriptionId}
            onChange={(e) => onSelectPrescription(e.target.value)}
          >
            <option value="new">Create new prescription</option>
            {existingPrescriptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.genericName}
              </option>
            ))}
          </select>
        </div>
      )}

      {lookup}

      <div className="flex flex-col gap-3.5">
        <div>
          <Label className="text-[0.8125rem] font-normal text-muted-foreground mb-1 block">Brand name</Label>
          <Input value={brandName} onChange={(e) => onFieldChange("brandName", e.target.value)} placeholder="e.g. Aviolix" />
          {errors.brandName && (
            <p className="mt-1 text-[0.8125rem] text-bp">{errors.brandName}</p>
          )}
        </div>
        <div>
          <Label className="text-[0.8125rem] font-normal text-muted-foreground mb-1 block">Active ingredient</Label>
          <Input value={genericName} onChange={(e) => onFieldChange("genericName", e.target.value)} placeholder="e.g. Clopidogrel" />
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Combination drug</p>
            <p className="text-[0.8125rem] text-muted-foreground">Tablet with two active ingredients</p>
          </div>
          <Switch
            checked={isCombination}
            onCheckedChange={(v) => onFieldChange("isCombination", v)}
          />
        </div>

        {isCombination ? (
          <div>
            <Label className="text-[0.8125rem] font-normal text-muted-foreground mb-1 block">Each pill contains …</Label>
            {comboOptions.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {comboOptions.map((opt) => {
                  const selected =
                    formatCompoundShort(compounds) === formatCompoundShort(opt.compounds);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => applyComboOption(opt)}
                      className={cn(
                        "min-h-9 border px-2.5 font-mono text-[0.8125rem]",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-line hover:bg-foreground/6"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="space-y-2">
              {compounds.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) => setCompound(i, { name: e.target.value })}
                    placeholder={i === 0 ? "e.g. Sacubitril" : "e.g. Valsartan"}
                    className="flex-1"
                  />
                  <div className="relative shrink-0">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={c.strength || ""}
                      onChange={(e) =>
                        setCompound(i, { strength: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="0"
                      aria-label={`${c.name || `Compound ${i + 1}`} strength per pill`}
                      className="w-28 pr-10 font-mono"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[0.8125rem] text-muted-foreground">mg</span>
                  </div>
                </div>
              ))}
            </div>
            {comboTotal > 0 && (
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                Total per pill: <span className="font-mono font-semibold text-foreground">{comboTotal}mg</span>
              </p>
            )}
            {errors.compounds && (
              <p className="mt-1 text-[0.8125rem] text-bp">{errors.compounds}</p>
            )}
          </div>
        ) : (
          <div>
            <Label className="text-[0.8125rem] font-normal text-muted-foreground mb-1 block">Each pill contains …</Label>
            <Input value={dosageStrength} onChange={(e) => onFieldChange("dosageStrength", e.target.value)} placeholder="e.g. 75mg" aria-label="Strength per pill" className="font-mono" />
            {result && result.dosageStrengths.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.dosageStrengths.map((s: string) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onFieldChange("dosageStrength", s)}
                    className={cn(
                      "min-h-9 border px-2.5 font-mono text-[0.8125rem]",
                      dosageStrength === s
                        ? "border-foreground bg-foreground text-background"
                        : "border-line hover:bg-foreground/6"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
