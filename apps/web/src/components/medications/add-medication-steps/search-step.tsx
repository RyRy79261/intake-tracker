"use client";

import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import { Loader2, Search } from "lucide-react";
import { useAuthGate } from "@/components/auth-guard";
import type { Prescription, CompoundStrength } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { MedicineStrengthOption } from "@/hooks/use-medicine-search";
import { cn } from "@/lib/utils";
import { compoundSum, formatCompoundShort } from "@intake/core/compound";
import type { FieldChange } from "@/components/medications/add-medication-steps/types";

export function SearchStep({
  formState, onFieldChange, errors,
  existingPrescriptions, onSelectPrescription,
  onSearch, isSearching, searchError,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
  errors: Record<string, string>;
  existingPrescriptions: Prescription[];
  onSelectPrescription: (id: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  searchError?: string;
}) {
  const showAi = useAuthGate();
  const {
    searchQuery, searchResult: result, brandName, genericName,
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
    <div className="space-y-4">
      {existingPrescriptions.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Assign to prescription</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-xs"
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

      {showAi && (
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Search medication</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Aviolix, Clopidogrel..."
              value={searchQuery}
              onChange={(e) => onFieldChange("searchQuery", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLElement).blur();
                  onSearch();
                }
              }}
            />
            <Button
              onClick={onSearch}
              disabled={isSearching || !searchQuery.trim()}
              size="icon"
              className="shrink-0 bg-teal-600 hover:bg-teal-700"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {searchError && <p className="text-xs text-red-500 mt-1">{searchError}</p>}
        </div>
      )}

      {showAi && result && (
        <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 p-3 text-sm space-y-1">
          <p className="font-medium text-teal-700 dark:text-teal-300">Found: {result.genericName}</p>
          {result.isGenericFallback && (
            <div className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-1 rounded text-xs mt-1 mb-2 border border-amber-200 dark:border-amber-800">
              Could not find physical details for that specific brand. Showing appearance for the generic equivalent.
            </div>
          )}
          {result.drugClass && <p className="text-xs text-muted-foreground">Class: {result.drugClass}</p>}
          {result.activeIngredients && result.activeIngredients.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Combination drug: {result.activeIngredients.join(" + ")}
            </p>
          )}
          {result.localAlternatives && result.localAlternatives.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Local: {result.localAlternatives.join(", ")}
            </p>
          )}
          {result.dosageStrengths.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Strengths: {result.dosageStrengths.join(", ")}
            </p>
          )}
          {result.pillDescription && (
            <p className="text-xs text-muted-foreground">
              Appearance: {result.pillDescription}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3 pt-2">
        <div>
          <Label className="text-sm mb-1.5 block">Brand name</Label>
          <Input value={brandName} onChange={(e) => onFieldChange("brandName", e.target.value)} placeholder="e.g. Aviolix" />
          {errors.brandName && (
            <p className="text-sm text-destructive mt-1">{errors.brandName}</p>
          )}
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">Active ingredient</Label>
          <Input value={genericName} onChange={(e) => onFieldChange("genericName", e.target.value)} placeholder="e.g. Clopidogrel" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Combination drug</p>
            <p className="text-xs text-muted-foreground">Tablet with two active ingredients</p>
          </div>
          <Switch
            checked={isCombination}
            onCheckedChange={(v) => onFieldChange("isCombination", v)}
          />
        </div>

        {isCombination ? (
          <div>
            <Label className="text-sm mb-1.5 block">Active ingredients (per pill)</Label>
            {comboOptions.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {comboOptions.map((opt) => {
                  const selected =
                    formatCompoundShort(compounds) === formatCompoundShort(opt.compounds);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => applyComboOption(opt)}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border transition-colors",
                        selected
                          ? "bg-teal-100 border-teal-300 dark:bg-teal-900 dark:border-teal-700"
                          : "border-border hover:bg-muted"
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
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={c.strength || ""}
                      onChange={(e) =>
                        setCompound(i, { strength: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="mg"
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">mg</span>
                  </div>
                </div>
              ))}
            </div>
            {comboTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Total per pill: <span className="font-medium text-foreground">{comboTotal}mg</span>
              </p>
            )}
            {errors.compounds && (
              <p className="text-sm text-destructive mt-1">{errors.compounds}</p>
            )}
          </div>
        ) : (
          <div>
            <Label className="text-sm mb-1.5 block">Dosage strength</Label>
            <Input value={dosageStrength} onChange={(e) => onFieldChange("dosageStrength", e.target.value)} placeholder="e.g. 75mg" />
            {result && result.dosageStrengths.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {result.dosageStrengths.map((s: string) => (
                  <button
                    key={s}
                    onClick={() => onFieldChange("dosageStrength", s)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border transition-colors",
                      dosageStrength === s
                        ? "bg-teal-100 border-teal-300 dark:bg-teal-900 dark:border-teal-700"
                        : "border-border hover:bg-muted"
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
