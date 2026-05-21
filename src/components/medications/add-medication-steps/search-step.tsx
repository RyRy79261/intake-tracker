"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
import { useAuthGate } from "@/components/auth-guard";
import type { Prescription } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import { cn } from "@/lib/utils";
import type { FieldChange } from "./types";

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
  const { searchQuery, searchResult: result, brandName, genericName, dosageStrength, selectedPrescriptionId } = formState;
  return (
    <div className="space-y-4">
      {existingPrescriptions.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Assign to prescription</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
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
      </div>
    </div>
  );
}
