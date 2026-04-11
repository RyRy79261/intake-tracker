"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Scale } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { useSettings } from "@/hooks/use-settings";
import { validateAndSave, incrementSetting, decrementSetting } from "@/lib/settings-helpers";
import { cn } from "@/lib/utils";

function GraphToggle({
  label,
  description,
  checked,
  onChange,
  activeColor,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  activeColor: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
        checked ? activeColor : "border-border bg-background"
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          "w-10 h-6 rounded-full transition-colors relative",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}

export function WeightSettingsSection() {
  const settings = useSettings();
  const [incrementInput, setIncrementInput] = useState(settings.weightIncrement.toString());

  useEffect(() => {
    setIncrementInput(settings.weightIncrement.toString());
  }, [settings.weightIncrement]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <Scale className="w-4 h-4" />
        <h3 className="font-semibold">Weight Settings</h3>
      </div>
      <div className="space-y-3 pl-6">
        <div className="space-y-2">
          <Label htmlFor="weight-increment">Increment (kg)</Label>
          <NumericInput
            id="weight-increment"
            value={incrementInput}
            onChange={setIncrementInput}
            onBlur={() => validateAndSave(incrementInput, 0.05, 1, settings.weightIncrement, settings.setWeightIncrement, setIncrementInput)}
            min={0.05}
            max={1}
            step={0.05}
            onIncrement={() => incrementSetting(settings.weightIncrement, 0.05, 1, settings.setWeightIncrement, setIncrementInput)}
            onDecrement={() => decrementSetting(settings.weightIncrement, 0.05, 0.05, settings.setWeightIncrement, setIncrementInput)}
          />
          <p className="text-xs text-muted-foreground">
            Amount added with each +/- tap (0.05-1.00 kg)
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Weight Graph Overlays
          </p>
          <p className="text-xs text-muted-foreground">
            Choose which reference lines appear by default on the weight chart.
            You can still toggle them on/off directly on the chart.
          </p>
          <div className="space-y-3">
            <GraphToggle
              label="Eating"
              description="Show eating event markers"
              checked={settings.weightGraphShowEating}
              onChange={settings.setWeightGraphShowEating}
              activeColor="bg-orange-100 border-orange-300 dark:bg-orange-900/50 dark:border-orange-700"
            />
            <GraphToggle
              label="Urination"
              description="Show urination event markers"
              checked={settings.weightGraphShowUrination}
              onChange={settings.setWeightGraphShowUrination}
              activeColor="bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700"
            />
            <GraphToggle
              label="Defecation"
              description="Show defecation event markers"
              checked={settings.weightGraphShowDefecation}
              onChange={settings.setWeightGraphShowDefecation}
              activeColor="bg-stone-100 border-stone-300 dark:bg-stone-900/50 dark:border-stone-700"
            />
            <GraphToggle
              label="Drinking"
              description="Show water intake markers"
              checked={settings.weightGraphShowDrinking}
              onChange={settings.setWeightGraphShowDrinking}
              activeColor="bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
