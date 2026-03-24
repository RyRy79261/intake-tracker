"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { useAddComposableEntry } from "@/hooks/use-composable-entry";
import { useToast } from "@/hooks/use-toast";
import type { ComposableEntryInput } from "@/lib/composable-entry-service";

interface PresetTabProps {
  type: "caffeine" | "alcohol";
}

export function PresetTab({ type }: PresetTabProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [volumeMl, setVolumeMl] = useState<number>(0);
  const [substancePer100ml, setSubstancePer100ml] = useState<number>(0);
  const [beverageName, setBeverageName] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLookupUsed, setAiLookupUsed] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);

  const allPresets = useSettingsStore((s) => s.liquidPresets);
  const addPreset = useSettingsStore((s) => s.addLiquidPreset);
  const addEntry = useAddComposableEntry();
  const { toast } = useToast();

  // Filter presets by type
  const presets = useMemo(
    () => allPresets.filter((p) => p.type === type),
    [allPresets, type]
  );

  const theme = type === "caffeine" ? CARD_THEMES.caffeine : CARD_THEMES.alcohol;

  // Calculated substance amount
  const calculatedAmount = useMemo(() => {
    if (volumeMl <= 0 || substancePer100ml <= 0) return null;
    if (type === "caffeine") {
      return Math.round((volumeMl / 100) * substancePer100ml);
    }
    return parseFloat(((volumeMl / 100) * substancePer100ml).toFixed(1));
  }, [volumeMl, substancePer100ml, type]);

  // Presets to display (collapse if more than 8)
  const visiblePresets = useMemo(() => {
    if (presets.length <= 8 || showAllPresets) return presets;
    return presets.slice(0, 6);
  }, [presets, showAllPresets]);

  const handlePresetTap = (presetId: string) => {
    if (selectedPresetId === presetId) {
      // Deselect
      setSelectedPresetId(null);
      setVolumeMl(0);
      setSubstancePer100ml(0);
      setBeverageName("");
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setVolumeMl(preset.defaultVolumeMl);
    setSubstancePer100ml(preset.substancePer100ml);
    setBeverageName(preset.name);
    setSearchText("");
  };

  const handleAiLookup = async () => {
    if (!searchText.trim() || isLookingUp) return;
    setIsLookingUp(true);
    setSelectedPresetId(null);
    try {
      const res = await fetch("/api/ai/substance-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchText.trim(), type }),
      });
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      setSubstancePer100ml(data.substancePer100ml);
      setVolumeMl(data.defaultVolumeMl);
      setBeverageName(data.beverageName);
      setAiLookupUsed(true);
    } catch {
      toast({
        title: "Lookup failed",
        description: "Try a different name or enter values manually.",
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLog = async () => {
    if (isSubmitting || volumeMl <= 0 || substancePer100ml <= 0) return;
    setIsSubmitting(true);
    try {
      const entry: ComposableEntryInput = {
        substance: {
          type,
          description:
            beverageName ||
            searchText.trim() ||
            (type === "caffeine" ? "Coffee" : "Drink"),
          volumeMl,
          ...(type === "caffeine"
            ? { amountMg: Math.round((volumeMl / 100) * substancePer100ml) }
            : {
                amountStandardDrinks: parseFloat(
                  ((volumeMl / 100) * substancePer100ml).toFixed(1)
                ),
              }),
        },
      };
      await addEntry(entry);
      toast({
        title: "Logged",
        description: `${beverageName || searchText.trim() || "Entry"} recorded`,
        variant: "success",
      });
      // Reset fields
      setVolumeMl(0);
      setSubstancePer100ml(0);
      setBeverageName("");
      setSearchText("");
      setSelectedPresetId(null);
      setAiLookupUsed(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndLog = async () => {
    if (!beverageName.trim()) return;
    setIsSubmitting(true);
    try {
      addPreset({
        name: beverageName.trim(),
        type,
        substancePer100ml,
        defaultVolumeMl: volumeMl,
        isDefault: false,
        source: aiLookupUsed ? "ai" : "manual",
      });
      const entry: ComposableEntryInput = {
        substance: {
          type,
          description: beverageName.trim(),
          volumeMl,
          ...(type === "caffeine"
            ? { amountMg: Math.round((volumeMl / 100) * substancePer100ml) }
            : {
                amountStandardDrinks: parseFloat(
                  ((volumeMl / 100) * substancePer100ml).toFixed(1)
                ),
              }),
        },
      };
      await addEntry(entry);
      toast({
        title: "Saved & Logged",
        description: `${beverageName.trim()} saved as preset and logged`,
        variant: "success",
      });
      // Reset
      setVolumeMl(0);
      setSubstancePer100ml(0);
      setBeverageName("");
      setSearchText("");
      setSelectedPresetId(null);
      setAiLookupUsed(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save preset",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const substanceUnitLabel =
    type === "caffeine" ? "per 100ml (mg)" : "per 100ml (std drinks)";

  return (
    <>
      {/* 1. Preset Grid */}
      {presets.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">
          No {type} presets yet. Use AI lookup or enter values manually to
          create one.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {visiblePresets.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => handlePresetTap(preset.id)}
              className={cn(
                "min-h-[40px] w-full",
                selectedPresetId === preset.id && theme.activeToggle
              )}
            >
              <span className="flex items-center justify-between w-full">
                <span className="text-sm font-semibold">{preset.name}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.defaultVolumeMl}ml
                </span>
              </span>
            </Button>
          ))}
          {presets.length > 8 && !showAllPresets && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllPresets(true)}
              className="col-span-2 text-xs text-muted-foreground"
            >
              Show all ({presets.length})
            </Button>
          )}
        </div>
      )}

      {/* 2. AI Text Input */}
      <div className="relative mb-3">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={
            type === "caffeine" ? "Search beverage..." : "Search drink..."
          }
          aria-label="Search beverages for AI lookup"
          disabled={isLookingUp}
          className="h-10 pr-10"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAiLookup();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAiLookup}
          disabled={!searchText.trim() || isLookingUp}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Look up substance content"
        >
          {isLookingUp ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 3. Volume and Substance Fields */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <Label htmlFor={`${type}-volume`} className="text-xs text-muted-foreground">
            Volume (ml)
          </Label>
          <Input
            id={`${type}-volume`}
            type="number"
            value={volumeMl || ""}
            onChange={(e) => {
              setVolumeMl(Number(e.target.value) || 0);
              setSelectedPresetId(null);
            }}
            className="h-10"
            min={0}
          />
        </div>
        <div>
          <Label
            htmlFor={`${type}-per100ml`}
            className="text-xs text-muted-foreground"
          >
            {substanceUnitLabel}
          </Label>
          <Input
            id={`${type}-per100ml`}
            type="number"
            value={substancePer100ml || ""}
            onChange={(e) => {
              setSubstancePer100ml(Number(e.target.value) || 0);
              setSelectedPresetId(null);
            }}
            className="h-10"
            min={0}
            step={type === "alcohol" ? "0.01" : "1"}
          />
        </div>
      </div>

      {/* 4. Calculated Amount Display */}
      <div className="mb-4">
        {calculatedAmount !== null ? (
          <p className={cn("text-sm font-semibold", theme.iconColor)}>
            {calculatedAmount}{" "}
            {type === "caffeine" ? "mg caffeine" : "standard drinks"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter volume and concentration
          </p>
        )}
      </div>

      {/* 5. Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={handleLog}
          disabled={isSubmitting || volumeMl <= 0 || substancePer100ml <= 0}
          className={cn("h-12 w-full border", theme.outlineBorder)}
        >
          {isSubmitting ? "Logging..." : "Log Entry"}
        </Button>
        <Button
          variant="default"
          onClick={handleSaveAndLog}
          disabled={
            isSubmitting ||
            volumeMl <= 0 ||
            substancePer100ml <= 0 ||
            !beverageName.trim()
          }
          className={cn("h-12 w-full", theme.buttonBg)}
        >
          {isSubmitting ? "Saving..." : "Save & Log"}
        </Button>
      </div>
    </>
  );
}
