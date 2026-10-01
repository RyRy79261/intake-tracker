"use client";

import { useId, useState } from "react";
import type { CSSProperties } from "react";
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
import { Plus, Trash2, Pencil } from "lucide-react";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import type { LiquidPresetPatch } from "@/lib/constants";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { domainColor, type Domain } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
import { helpClass } from "@/components/settings/settings-kit";

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
    return "No caffeine or alcohol";
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
  isNew = false,
}: {
  preset: Partial<LiquidPreset>;
  onSave: (data: PresetFormData) => void;
  onCancel: () => void;
  saveLabel: string;
  isNew?: boolean;
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

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      tab,
      defaultVolumeMl,
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
    <div
      className={cn(
        "flex flex-col gap-2.5 bg-panel p-2.5 [&_input]:h-10 [&_label]:text-[0.8125rem] [&_label]:font-normal [&_label]:text-muted-foreground",
        isNew ? "mt-2.5 border border-line" : "border-t border-line first:border-t-0",
      )}
    >
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Beverage name"
          className="h-10 border-muted-foreground"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-category`}>Category</Label>
        <Select
          value={tab}
          onValueChange={(v) =>
            setTab(v as "coffee" | "alcohol" | "beverage")
          }
        >
          <SelectTrigger id={`${idPrefix}-category`} className="h-10 border-muted-foreground">
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
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-volume`}>Volume (ml)</Label>
        <Input
          id={`${idPrefix}-volume`}
          type="number"
          value={defaultVolumeMl || ""}
          onChange={(e) => setDefaultVolumeMl(Number(e.target.value) || 0)}
          className="h-10 border-muted-foreground"
          min={0}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-caffeine`}>
            Caffeine/100ml
          </Label>
          <Input
            id={`${idPrefix}-caffeine`}
            type="number"
            value={caffeinePer100ml || ""}
            onChange={(e) => setCaffeinePer100ml(Number(e.target.value) || 0)}
            className="h-10 border-muted-foreground"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-abv`}>
            % ABV
          </Label>
          <Input
            id={`${idPrefix}-abv`}
            type="number"
            value={alcoholPer100ml || ""}
            onChange={(e) => setAlcoholPer100ml(Number(e.target.value) || 0)}
            className="h-10 border-muted-foreground"
            min={0}
            step="0.5"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-sodium`}>
            Na/100ml
          </Label>
          <Input
            id={`${idPrefix}-sodium`}
            type="number"
            value={saltPer100ml || ""}
            onChange={(e) => setSaltPer100ml(Number(e.target.value) || 0)}
            className="h-10 border-muted-foreground"
            min={0}
          />
        </div>
        {sugarEnabled && (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-sugar`}>
              Sugar g/100ml
            </Label>
            <Input
              id={`${idPrefix}-sugar`}
              type="number"
              value={sugarPer100ml || ""}
              onChange={(e) => setSugarPer100ml(Number(e.target.value) || 0)}
              className="h-10 border-muted-foreground"
              min={0}
              step="0.1"
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel} className="border-muted-foreground">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!name.trim()}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

const GROUPS: ReadonlyArray<{ tab: LiquidPreset["tab"]; label: string; domain: Domain }> = [
  { tab: "coffee", label: "Coffee", domain: "caffeine" },
  { tab: "alcohol", label: "Alcohol", domain: "alcohol" },
  { tab: "beverage", label: "Beverage", domain: "water" },
];

/**
 * Settings › Tracking › Drink presets: the saved drinks grouped by the
 * Liquids tab they appear on, each with edit and (custom presets only)
 * delete, and an Add Preset form. Rendered as its own settings page.
 */
export function LiquidPresetsSection() {
  const liquidPresets = useSettingsStore((s) => s.liquidPresets);
  const addLiquidPreset = useSettingsStore((s) => s.addLiquidPreset);
  const updateLiquidPreset = useSettingsStore((s) => s.updateLiquidPreset);
  const deleteLiquidPreset = useSettingsStore((s) => s.deleteLiquidPreset);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  const renderRow = (preset: LiquidPreset) => {
    if (deletingPresetId === preset.id) {
      return (
        <div
          key={preset.id}
          role="alert"
          className="flex flex-col gap-2 border-t border-line bg-bp/8 p-2.5 text-sm first:border-t-0"
        >
          <span>Delete {preset.name}?</span>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="border-muted-foreground" onClick={() => setDeletingPresetId(null)}>
              Keep Preset
            </Button>
            <Button
              variant="destructive"
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
        <PresetEditForm
          key={preset.id}
          preset={preset}
          onSave={(data) => {
            updateLiquidPreset(preset.id, data);
            setEditingPresetId(null);
          }}
          onCancel={() => setEditingPresetId(null)}
          saveLabel="Save Changes"
        />
      );
    }

    const subs = formatPresetSubstances(preset, sugarEnabled);
    return (
      <div
        key={preset.id}
        className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 border-t border-line py-1 pl-2.5 pr-0.5 first:border-t-0"
        data-testid="preset-row"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-[1.3]">
            {preset.name}
            <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground">
              {preset.defaultVolumeMl}ml
            </span>
            {preset.isDefault && (
              <Badge variant="outline" className="border-muted-foreground font-medium text-muted-foreground">
                Default
              </Badge>
            )}
          </span>
          <span className="block text-xs leading-[1.35] text-muted-foreground">
            {subs}
          </span>
        </span>
        <span className="flex">
          <button
            type="button"
            onClick={() => setEditingPresetId(preset.id)}
            className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${preset.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          {!preset.isDefault && (
            <button
              type="button"
              onClick={() => setDeletingPresetId(preset.id)}
              className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${preset.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div>
      <p className={`${helpClass} mb-1 mt-2.5`}>
        Presets appear as one-tap buttons in the Liquids card&apos;s Coffee and Alcohol tabs. Default
        presets can be edited but not deleted.
      </p>

      {GROUPS.map(({ tab, label, domain }) => {
        const list = liquidPresets.filter((p) => p.tab === tab);
        if (list.length === 0) return null;
        return (
          <section key={tab} aria-label={`${label} presets`}>
            <h3
              className="mb-1.5 mt-4 flex items-center gap-2 text-[0.8125rem] font-semibold text-muted-foreground after:h-px after:flex-1 after:bg-line after:content-['']"
              style={{ "--c": domainColor(domain) } as CSSProperties}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-[color:var(--c)]" />
              {label} · {list.length}
            </h3>
            <div className="border border-line bg-background">{list.map(renderRow)}</div>
          </section>
        );
      })}

      {isAdding ? (
        <PresetEditForm
          preset={{}}
          isNew
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
          className="mt-3 h-12 w-full border-dashed border-muted-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Add Preset
        </Button>
      )}
    </div>
  );
}
