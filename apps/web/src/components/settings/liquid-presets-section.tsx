"use client";

import { useId, useState } from "react";
import { Label } from "@intake/ui/label";
import { Input } from "@intake/ui/input";
import { Button } from "@intake/ui/button";
import { Badge } from "@intake/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Plus, Trash2, Droplets, Pencil } from "lucide-react";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import type { LiquidPresetPatch } from "@/lib/constants";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

function formatPresetSubstances(
  preset: LiquidPreset,
  sugarEnabled: boolean,
): string {
  const parts: string[] = [];
  if (preset.caffeinePer100ml) {
    parts.push(`${preset.caffeinePer100ml}mg caff/100ml`);
  }
  if (preset.alcoholPer100ml) {
    // alcoholPer100ml has meant % ABV since 66781c98; the old "std alc/100ml"
    // unit read as ~50x the real strength.
    parts.push(`${preset.alcoholPer100ml}% ABV`);
  }
  if (preset.saltPer100ml) {
    parts.push(`${preset.saltPer100ml}mg sodium/100ml`);
  }
  if (sugarEnabled && preset.sugarPer100ml) {
    parts.push(`${preset.sugarPer100ml}g sugar/100ml`);
  }
  if (parts.length === 0) {
    return `${preset.waterContentPercent}% water`;
  }
  return parts.join(" + ");
}

type NutrientKey =
  | "caffeinePer100ml"
  | "alcoholPer100ml"
  | "saltPer100ml"
  | "sugarPer100ml";

/**
 * What the edit form hands back. The per-100ml nutrients are always present:
 * `undefined` means the user emptied the field. `updateLiquidPreset` deletes a
 * key sent as `undefined`; a key simply left out kept its old value, so a
 * preset edited to decaf went on logging the old caffeine.
 */
type PresetFormData = Omit<LiquidPreset, "id" | NutrientKey> &
  Required<Pick<LiquidPresetPatch, NutrientKey>>;

/** Drop the cleared keys so a new preset carries no own `undefined` fields. */
function toNewPreset(data: PresetFormData): Omit<LiquidPreset, "id"> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Omit<LiquidPreset, "id">;
}

const positiveOrUndefined = (value: number): number | undefined =>
  value > 0 ? value : undefined;

function PresetEditForm({
  preset,
  onSave,
  onCancel,
  saveLabel,
}: {
  preset: Partial<LiquidPreset>;
  onSave: (data: PresetFormData) => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const idPrefix = useId();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const [name, setName] = useState(preset.name ?? "");
  const [tab, setTab] = useState<"coffee" | "alcohol" | "beverage">(
    preset.tab ?? "coffee"
  );
  const [defaultVolumeMl, setDefaultVolumeMl] = useState(
    preset.defaultVolumeMl ?? 250
  );
  const [caffeinePer100ml, setCaffeinePer100ml] = useState(
    preset.caffeinePer100ml ?? 0
  );
  const [alcoholPer100ml, setAlcoholPer100ml] = useState(
    preset.alcoholPer100ml ?? 0
  );
  const [saltPer100ml, setSaltPer100ml] = useState(preset.saltPer100ml ?? 0);
  const [sugarPer100ml, setSugarPer100ml] = useState(
    preset.sugarPer100ml ?? 0
  );
  const [waterContentPercent, setWaterContentPercent] = useState(
    preset.waterContentPercent ?? 100
  );

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      tab,
      defaultVolumeMl,
      waterContentPercent,
      caffeinePer100ml: positiveOrUndefined(caffeinePer100ml),
      alcoholPer100ml: positiveOrUndefined(alcoholPer100ml),
      saltPer100ml: positiveOrUndefined(saltPer100ml),
      // The sugar input is hidden while the tracker is off: keep what the
      // preset already had rather than clearing a value the user can't see.
      sugarPer100ml: sugarEnabled
        ? positiveOrUndefined(sugarPer100ml)
        : preset.sugarPer100ml,
      isDefault: preset.isDefault ?? false,
      source: preset.source ?? "manual",
    });
  };

  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Beverage name"
          className="h-9"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Category</Label>
        <Select
          value={tab}
          onValueChange={(v) =>
            setTab(v as "coffee" | "alcohol" | "beverage")
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="coffee">Coffee</SelectItem>
            <SelectItem value="alcohol">Alcohol</SelectItem>
            {/* The Beverage tab has no presets, so a new "beverage" preset
                never showed up anywhere. Kept only so a legacy one can
                still be edited and moved to Coffee or Alcohol. */}
            {preset.tab === "beverage" && (
              <SelectItem value="beverage">Beverage (unused)</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Volume (ml)</Label>
          <Input
            type="number"
            value={defaultVolumeMl || ""}
            onChange={(e) => setDefaultVolumeMl(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Water %</Label>
          <Input
            type="number"
            value={waterContentPercent || ""}
            onChange={(e) =>
              setWaterContentPercent(Number(e.target.value) || 0)
            }
            className="h-9"
            min={0}
            max={100}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-caffeine`} className="text-xs">
            Caffeine/100ml
          </Label>
          <Input
            id={`${idPrefix}-caffeine`}
            type="number"
            value={caffeinePer100ml || ""}
            onChange={(e) => setCaffeinePer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-abv`} className="text-xs">
            % ABV
          </Label>
          <Input
            id={`${idPrefix}-abv`}
            type="number"
            value={alcoholPer100ml || ""}
            onChange={(e) => setAlcoholPer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
            step="0.5"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-sodium`} className="text-xs">
            Na/100ml
          </Label>
          <Input
            id={`${idPrefix}-sodium`}
            type="number"
            value={saltPer100ml || ""}
            onChange={(e) => setSaltPer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
          />
        </div>
        {sugarEnabled && (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-sugar`} className="text-xs">
              Sugar g/100ml
            </Label>
            <Input
              id={`${idPrefix}-sugar`}
              type="number"
              value={sugarPer100ml || ""}
              onChange={(e) => setSugarPer100ml(Number(e.target.value) || 0)}
              className="h-9"
              min={0}
              step="0.1"
            />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex-1"
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function LiquidPresetsSection() {
  const liquidPresets = useSettingsStore((s) => s.liquidPresets);
  const addLiquidPreset = useSettingsStore((s) => s.addLiquidPreset);
  const updateLiquidPreset = useSettingsStore((s) => s.updateLiquidPreset);
  const deleteLiquidPreset = useSettingsStore((s) => s.deleteLiquidPreset);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  return (
    <ExpandableSettingsSection
      icon={Droplets}
      label="Liquid Presets"
      iconColorClass="text-blue-600 dark:text-blue-400"
    >
      <div className="space-y-0">
        {liquidPresets.map((preset) => {
          if (deletingPresetId === preset.id) {
            return (
              <div
                key={preset.id}
                className="flex items-center justify-between py-3 px-2 border-b border-border/50 bg-muted/30 rounded"
              >
                <span className="text-sm">Delete {preset.name}?</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeletingPresetId(null)}
                  >
                    Keep Preset
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      deleteLiquidPreset(preset.id);
                      setDeletingPresetId(null);
                    }}
                  >
                    Delete Preset
                  </Button>
                </div>
              </div>
            );
          }

          if (editingPresetId === preset.id) {
            return (
              <div key={preset.id} className="py-2">
                <PresetEditForm
                  preset={preset}
                  onSave={(data) => {
                    updateLiquidPreset(preset.id, data);
                    setEditingPresetId(null);
                  }}
                  onCancel={() => setEditingPresetId(null)}
                  saveLabel="Save Changes"
                />
              </div>
            );
          }

          return (
            <div
              key={preset.id}
              className="flex items-center justify-between py-2 border-b border-border/50"
            >
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">{preset.name}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {preset.defaultVolumeMl}ml
                </span>
                {preset.isDefault && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    Default
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatPresetSubstances(preset, sugarEnabled)}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingPresetId(preset.id)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${preset.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!preset.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDeletingPresetId(preset.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${preset.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdding ? (
        <PresetEditForm
          preset={{}}
          onSave={(data) => {
            addLiquidPreset(toNewPreset(data));
            setIsAdding(false);
          }}
          onCancel={() => setIsAdding(false)}
          saveLabel="Add Preset"
        />
      ) : (
        <Button
          variant="outline"
          className="w-full h-10"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Preset
        </Button>
      )}
    </ExpandableSettingsSection>
  );
}
