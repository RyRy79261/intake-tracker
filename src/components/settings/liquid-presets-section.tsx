"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Droplets, Pencil } from "lucide-react";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import { ExpandableSettingsSection } from "@/components/settings/expandable-settings-section";

function formatPresetSubstances(preset: LiquidPreset): string {
  const parts: string[] = [];
  if (preset.caffeinePer100ml) {
    parts.push(`${preset.caffeinePer100ml}mg caff/100ml`);
  }
  if (preset.alcoholPer100ml) {
    parts.push(`${preset.alcoholPer100ml}std alc/100ml`);
  }
  if (preset.saltPer100ml) {
    parts.push(`${preset.saltPer100ml}mg salt/100ml`);
  }
  if (parts.length === 0) {
    return `${preset.waterContentPercent}% water`;
  }
  return parts.join(" + ");
}

function PresetEditForm({
  preset,
  onSave,
  onCancel,
  saveLabel,
}: {
  preset: Partial<LiquidPreset>;
  onSave: (data: Omit<LiquidPreset, "id">) => void;
  onCancel: () => void;
  saveLabel: string;
}) {
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
      ...(caffeinePer100ml > 0 && { caffeinePer100ml }),
      ...(alcoholPer100ml > 0 && { alcoholPer100ml }),
      ...(saltPer100ml > 0 && { saltPer100ml }),
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
            <SelectItem value="beverage">Beverage</SelectItem>
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
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Caffeine/100ml</Label>
          <Input
            type="number"
            value={caffeinePer100ml || ""}
            onChange={(e) => setCaffeinePer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">% ABV</Label>
          <Input
            type="number"
            value={alcoholPer100ml || ""}
            onChange={(e) => setAlcoholPer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
            step="0.5"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Na/100ml</Label>
          <Input
            type="number"
            value={saltPer100ml || ""}
            onChange={(e) => setSaltPer100ml(Number(e.target.value) || 0)}
            className="h-9"
            min={0}
          />
        </div>
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
                  {formatPresetSubstances(preset)}
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
            addLiquidPreset(data);
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
