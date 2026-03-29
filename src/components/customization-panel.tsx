"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sliders, Pencil, Trash2, Plus } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

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
        <Label className="text-xs">Tab</Label>
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

export function CustomizationPanel() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();

  const liquidPresets = useSettingsStore((s) => s.liquidPresets);
  const addLiquidPreset = useSettingsStore((s) => s.addLiquidPreset);
  const updateLiquidPreset = useSettingsStore((s) => s.updateLiquidPreset);
  const deleteLiquidPreset = useSettingsStore((s) => s.deleteLiquidPreset);

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Sliders className="w-4 h-4" />
          Defaults &amp; Customizations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5" />
            Defaults &amp; Customizations
          </DialogTitle>
          <DialogDescription>
            Configure default values for tracking metrics and graph display
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="tracking" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tracking" className="text-xs">Tracking</TabsTrigger>
            <TabsTrigger value="presets" className="text-xs">Liquid Presets</TabsTrigger>
            <TabsTrigger value="graph" className="text-xs">Graph</TabsTrigger>
          </TabsList>

          {/* Tracking Tab */}
          <TabsContent value="tracking" className="mt-4 space-y-6">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Urination default amount</Label>
                <Select
                  value={settings.urinationDefaultAmount}
                  onValueChange={(v) => settings.setUrinationDefaultAmount(v as "small" | "medium" | "large")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-selected amount when opening the urination details dialog
                </p>
              </div>
              <div className="space-y-2">
                <Label>Defecation default amount</Label>
                <Select
                  value={settings.defecationDefaultAmount}
                  onValueChange={(v) => settings.setDefecationDefaultAmount(v as "small" | "medium" | "large")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-selected amount when opening the defecation details dialog
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Liquid Presets Tab */}
          <TabsContent value="presets" className="mt-4 space-y-4">
            <h3 className="text-sm font-semibold">Liquid Presets</h3>

            {/* Preset List */}
            <div className="space-y-0">
              {liquidPresets.map((preset) => {
                // Delete confirmation
                if (deletingPresetId === preset.id) {
                  return (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between py-3 px-2 border-b border-border/50 bg-muted/30 rounded"
                    >
                      <span className="text-sm">
                        Delete {preset.name}?
                      </span>
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

                // Edit form
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

                // Normal display
                return (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between py-2 border-b border-border/50"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium">
                        {preset.name}
                      </span>
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

            {/* Add Preset */}
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
                className="w-full h-10 mt-3"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Preset
              </Button>
            )}
          </TabsContent>

          {/* Graph Tab */}
          <TabsContent value="graph" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

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
