"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Coffee, Wine, Plus, Trash2 } from "lucide-react";
import { useSettingsStore, type Settings } from "@/stores/settings-store";

type CaffeineType = Settings["substanceConfig"]["caffeine"]["types"][number];
type AlcoholType = Settings["substanceConfig"]["alcohol"]["types"][number];

export function SubstanceSettingsSection() {
  const substanceConfig = useSettingsStore((s) => s.substanceConfig);
  const setSubstanceConfig = useSettingsStore((s) => s.setSubstanceConfig);

  const [newCaffeineName, setNewCaffeineName] = useState("");
  const [newAlcoholName, setNewAlcoholName] = useState("");

  const updateCaffeineEnabled = (enabled: boolean) => {
    setSubstanceConfig({
      ...substanceConfig,
      caffeine: { ...substanceConfig.caffeine, enabled },
    });
  };

  const updateAlcoholEnabled = (enabled: boolean) => {
    setSubstanceConfig({
      ...substanceConfig,
      alcohol: { ...substanceConfig.alcohol, enabled },
    });
  };

  const updateCaffeineType = (index: number, field: keyof CaffeineType, value: string | number) => {
    const types = substanceConfig.caffeine.types.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    );
    setSubstanceConfig({
      ...substanceConfig,
      caffeine: { ...substanceConfig.caffeine, types },
    });
  };

  const updateAlcoholType = (index: number, field: keyof AlcoholType, value: string | number) => {
    const types = substanceConfig.alcohol.types.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    );
    setSubstanceConfig({
      ...substanceConfig,
      alcohol: { ...substanceConfig.alcohol, types },
    });
  };

  const addCaffeineType = () => {
    if (!newCaffeineName.trim()) return;
    const types = [
      ...substanceConfig.caffeine.types,
      { name: newCaffeineName.trim(), defaultMg: 95, defaultVolumeMl: 250 },
    ];
    setSubstanceConfig({
      ...substanceConfig,
      caffeine: { ...substanceConfig.caffeine, types },
    });
    setNewCaffeineName("");
  };

  const addAlcoholType = () => {
    if (!newAlcoholName.trim()) return;
    const types = [
      ...substanceConfig.alcohol.types,
      { name: newAlcoholName.trim(), defaultDrinks: 1, defaultVolumeMl: 250 },
    ];
    setSubstanceConfig({
      ...substanceConfig,
      alcohol: { ...substanceConfig.alcohol, types },
    });
    setNewAlcoholName("");
  };

  const removeCaffeineType = (index: number) => {
    const types = substanceConfig.caffeine.types.filter((_, i) => i !== index);
    setSubstanceConfig({
      ...substanceConfig,
      caffeine: { ...substanceConfig.caffeine, types },
    });
  };

  const removeAlcoholType = (index: number) => {
    const types = substanceConfig.alcohol.types.filter((_, i) => i !== index);
    setSubstanceConfig({
      ...substanceConfig,
      alcohol: { ...substanceConfig.alcohol, types },
    });
  };

  return (
    <div className="space-y-6">
      {/* Caffeine Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Coffee className="w-4 h-4" />
            <h3 className="font-semibold">Caffeine Tracking</h3>
          </div>
          <Switch
            checked={substanceConfig.caffeine.enabled}
            onCheckedChange={updateCaffeineEnabled}
          />
        </div>

        {substanceConfig.caffeine.enabled && (
          <div className="space-y-3 pl-6">
            {substanceConfig.caffeine.types.map((t, i) => (
              <div key={`caffeine-${i}`} className="flex items-center gap-2">
                <Input
                  value={t.name}
                  onChange={(e) => updateCaffeineType(i, "name", e.target.value)}
                  className="flex-1"
                  placeholder="Name"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={t.defaultMg}
                    onChange={(e) => updateCaffeineType(i, "defaultMg", Number(e.target.value) || 0)}
                    className="w-20"
                    min={0}
                  />
                  <Label className="text-xs text-muted-foreground shrink-0">mg</Label>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={t.defaultVolumeMl}
                    onChange={(e) => updateCaffeineType(i, "defaultVolumeMl", Number(e.target.value) || 0)}
                    className="w-20"
                    min={0}
                  />
                  <Label className="text-xs text-muted-foreground shrink-0">ml</Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCaffeineType(i)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newCaffeineName}
                onChange={(e) => setNewCaffeineName(e.target.value)}
                placeholder="New type name"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCaffeineType();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addCaffeineType}
                disabled={!newCaffeineName.trim()}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Alcohol Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-400">
            <Wine className="w-4 h-4" />
            <h3 className="font-semibold">Alcohol Tracking</h3>
          </div>
          <Switch
            checked={substanceConfig.alcohol.enabled}
            onCheckedChange={updateAlcoholEnabled}
          />
        </div>

        {substanceConfig.alcohol.enabled && (
          <div className="space-y-3 pl-6">
            {substanceConfig.alcohol.types.map((t, i) => (
              <div key={`alcohol-${i}`} className="flex items-center gap-2">
                <Input
                  value={t.name}
                  onChange={(e) => updateAlcoholType(i, "name", e.target.value)}
                  className="flex-1"
                  placeholder="Name"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={t.defaultDrinks}
                    onChange={(e) => updateAlcoholType(i, "defaultDrinks", Number(e.target.value) || 0)}
                    className="w-20"
                    min={0}
                    step={0.1}
                  />
                  <Label className="text-xs text-muted-foreground shrink-0">drinks</Label>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={t.defaultVolumeMl}
                    onChange={(e) => updateAlcoholType(i, "defaultVolumeMl", Number(e.target.value) || 0)}
                    className="w-20"
                    min={0}
                  />
                  <Label className="text-xs text-muted-foreground shrink-0">ml</Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAlcoholType(i)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newAlcoholName}
                onChange={(e) => setNewAlcoholName(e.target.value)}
                placeholder="New type name"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAlcoholType();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addAlcoholType}
                disabled={!newAlcoholName.trim()}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
