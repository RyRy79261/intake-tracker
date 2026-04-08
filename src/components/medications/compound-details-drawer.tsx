"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Check, X } from "lucide-react";
import { useMedicineSearch, type MedicineSearchResult } from "@/hooks/use-medicine-search";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Prescription } from "@/lib/db";

interface CompoundDetailsDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldDiff {
  field: string;
  label: string;
  oldValue: string | string[] | undefined;
  newValue: string | string[] | undefined;
  accepted: boolean;
}

const COMPOUND_FIELDS: Array<{ field: keyof Prescription & keyof MedicineSearchResult; label: string }> = [
  { field: "drugClass", label: "Drug Class" },
  { field: "mechanismOfAction", label: "Mechanism of Action" },
  { field: "commonIndications", label: "Common Indications" },
  { field: "dosageStrengths", label: "Dosage Strengths" },
  { field: "foodInstruction", label: "Food Instructions" },
  { field: "contraindications", label: "Contraindications" },
  { field: "warnings", label: "Warnings" },
];

function formatFieldValue(value: string | string[] | undefined): string {
  if (value === undefined || value === null) return "Not available";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None";
  return value || "Not available";
}

function valuesEqual(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

export function CompoundDetailsDrawer({ prescription, open, onOpenChange }: CompoundDetailsDrawerProps) {
  const searchMutation = useMedicineSearch();
  const updatePrescription = useUpdatePrescription();
  const { toast } = useToast();
  const [diffs, setDiffs] = useState<FieldDiff[] | null>(null);

  if (!prescription) return null;

  const hasCompoundData = COMPOUND_FIELDS.some(
    (f) => prescription[f.field] !== undefined && prescription[f.field] !== null && prescription[f.field] !== ""
  );

  const handleRefresh = async () => {
    try {
      const result = await searchMutation.mutateAsync(prescription.genericName);

      const fieldDiffs: FieldDiff[] = [];
      for (const { field, label } of COMPOUND_FIELDS) {
        const oldVal = prescription[field] as string | string[] | undefined;
        const newVal = result[field as keyof MedicineSearchResult] as string | string[] | undefined;
        if (!valuesEqual(oldVal, newVal) && newVal !== undefined && newVal !== "") {
          fieldDiffs.push({
            field,
            label,
            oldValue: oldVal,
            newValue: newVal,
            accepted: true,
          });
        }
      }

      if (fieldDiffs.length === 0) {
        toast({ title: "Compound data is up to date", description: "No changes found." });
      } else {
        setDiffs(fieldDiffs);
      }
    } catch {
      toast({
        title: "Could not fetch compound data",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const handleApply = async () => {
    if (!diffs) return;
    const accepted = diffs.filter((d) => d.accepted);
    if (accepted.length === 0) {
      setDiffs(null);
      return;
    }

    const updates: Record<string, unknown> = {};
    for (const diff of accepted) {
      updates[diff.field] = diff.newValue;
    }

    try {
      await updatePrescription.mutateAsync({
        id: prescription.id,
        updates: updates as Partial<Omit<Prescription, "id" | "createdAt">>,
      });
      toast({ title: "Compound data updated", description: `${accepted.length} field(s) updated.` });
      setDiffs(null);
    } catch {
      toast({
        title: "Failed to update",
        description: "Could not save changes. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleDiscard = () => {
    setDiffs(null);
  };

  const toggleDiff = (index: number) => {
    setDiffs((prev) =>
      prev ? prev.map((d, i) => (i === index ? { ...d, accepted: !d.accepted } : d)) : null
    );
  };

  return (
    <Drawer open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) setDiffs(null); }}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>Compound Details</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!hasCompoundData && !diffs && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">No compound data</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap &quot;Refresh from AI&quot; to fetch drug information.
              </p>
            </div>
          )}

          {/* Read-only compound fields */}
          {hasCompoundData && !diffs && (
            <div className="space-y-4">
              {COMPOUND_FIELDS.map(({ field, label }) => {
                const value = prescription[field];
                if (value === undefined || value === null || value === "") return null;
                return (
                  <div key={field} className="space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {label}
                    </h4>
                    <p className="text-sm font-medium">
                      {Array.isArray(value) ? (
                        <span className="space-y-0.5">
                          {(value as string[]).map((v, i) => (
                            <span key={i} className="block">{v}</span>
                          ))}
                        </span>
                      ) : (
                        String(value)
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Diff view */}
          {diffs && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {diffs.length} field(s) changed
              </p>
              {diffs.map((diff, index) => (
                <div
                  key={diff.field}
                  className={cn(
                    "rounded-lg border p-3 cursor-pointer transition-colors",
                    diff.accepted
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                      : "border-border bg-muted/30"
                  )}
                  onClick={() => toggleDiff(index)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {diff.label}
                    </h4>
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center",
                      diff.accepted
                        ? "bg-emerald-500 text-white"
                        : "border border-muted-foreground/30"
                    )}>
                      {diff.accepted && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                  {diff.oldValue !== undefined && diff.oldValue !== "" && (
                    <p className="text-xs text-muted-foreground line-through mb-1">
                      {formatFieldValue(diff.oldValue)}
                    </p>
                  )}
                  <p className="text-sm font-medium text-foreground">
                    {formatFieldValue(diff.newValue)}
                  </p>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={handleApply}
                  disabled={updatePrescription.isPending}
                >
                  {updatePrescription.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Apply Changes"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDiscard}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}

          {/* Refresh button */}
          {!diffs && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleRefresh}
              disabled={searchMutation.isPending}
            >
              {searchMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh from AI
                </>
              )}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
