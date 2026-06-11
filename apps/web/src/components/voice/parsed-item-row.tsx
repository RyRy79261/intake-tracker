"use client";

import { Check, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { standardDrinksFromAbv } from "@/lib/alcohol-units";
import {
  VOICE_ITEM_COLOR,
  VOICE_ITEM_LABEL,
  type VoiceParsedItem,
} from "@/lib/voice-types";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";

interface ParsedItemRowProps {
  item: VoiceParsedItem;
  index: number;
  onChange: (next: VoiceParsedItem) => void;
  onApprove: () => void;
  onReject: () => void;
  approved: boolean | null; // null = pending
  disabled?: boolean;
}

type ColorClass = { bar: string; ring: string; chip: string };

// Tailwind needs static class names — map each token to its concrete bg/text.
const COLOR_CLASS: Record<string, ColorClass> = {
  bp: { bar: "bg-bp", ring: "ring-bp/30", chip: "bg-bp text-bp-foreground" },
  weight: {
    bar: "bg-weight",
    ring: "ring-weight/30",
    chip: "bg-weight text-weight-foreground",
  },
  water: {
    bar: "bg-water",
    ring: "ring-water/30",
    chip: "bg-water text-water-foreground",
  },
  salt: {
    bar: "bg-salt",
    ring: "ring-salt/30",
    chip: "bg-salt text-salt-foreground",
  },
  eating: {
    bar: "bg-eating",
    ring: "ring-eating/30",
    chip: "bg-eating text-eating-foreground",
  },
  caffeine: {
    bar: "bg-caffeine",
    ring: "ring-caffeine/30",
    chip: "bg-caffeine text-caffeine-foreground",
  },
  alcohol: {
    bar: "bg-alcohol",
    ring: "ring-alcohol/30",
    chip: "bg-alcohol text-alcohol-foreground",
  },
  urination: {
    bar: "bg-urination",
    ring: "ring-urination/30",
    chip: "bg-urination text-urination-foreground",
  },
  defecation: {
    bar: "bg-defecation",
    ring: "ring-defecation/30",
    chip: "bg-defecation text-defecation-foreground",
  },
};

function numberOrZero(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// exactOptionalPropertyTypes forbids assigning `undefined` to an optional
// field — we must omit the key entirely. These helpers rebuild the item with
// the optional value either present or stripped out.
function setOptionalNumber<T extends object, K extends string>(
  base: T,
  key: K,
  raw: string
): T & Partial<Record<K, number>> {
  const next = { ...base } as Record<string, unknown>;
  if (raw === "") {
    delete next[key];
  } else {
    next[key] = numberOrZero(raw);
  }
  return next as T & Partial<Record<K, number>>;
}

function setOptionalEnum<T extends object, K extends string, V extends string>(
  base: T,
  key: K,
  raw: string
): T & Partial<Record<K, V>> {
  const next = { ...base } as Record<string, unknown>;
  if (raw === "") {
    delete next[key];
  } else {
    next[key] = raw as V;
  }
  return next as T & Partial<Record<K, V>>;
}

function ItemEditor({
  item,
  onChange,
  disabled,
}: {
  item: VoiceParsedItem;
  onChange: (next: VoiceParsedItem) => void;
  disabled?: boolean;
}) {
  // Optional tracker visibility — gates the food editor's sugar/potassium
  // fields so disabled trackers don't show up even if the AI returned a
  // value. Reading both unconditionally keeps hook order stable across
  // every render, regardless of which item kind we're editing.
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  switch (item.kind) {
    case "blood_pressure":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Systolic">
            <Input
              type="number"
              inputMode="numeric"
              disabled={disabled}
              value={item.systolic}
              onChange={(e) =>
                onChange({ ...item, systolic: numberOrZero(e.target.value) })
              }
            />
          </Field>
          <Field label="Diastolic">
            <Input
              type="number"
              inputMode="numeric"
              disabled={disabled}
              value={item.diastolic}
              onChange={(e) =>
                onChange({ ...item, diastolic: numberOrZero(e.target.value) })
              }
            />
          </Field>
          <Field label="Heart rate">
            <Input
              type="number"
              inputMode="numeric"
              disabled={disabled}
              value={item.heartRate ?? ""}
              placeholder="—"
              onChange={(e) =>
                onChange(setOptionalNumber(item, "heartRate", e.target.value))
              }
            />
          </Field>
        </div>
      );

    case "weight":
      return (
        <Field label="Weight (kg)">
          <Input
            type="number"
            step="0.1"
            inputMode="decimal"
            disabled={disabled}
            value={item.weightKg}
            onChange={(e) =>
              onChange({ ...item, weightKg: numberOrZero(e.target.value) })
            }
          />
        </Field>
      );

    case "water":
      return (
        <Field label="Water (ml)">
          <Input
            type="number"
            inputMode="numeric"
            disabled={disabled}
            value={item.ml}
            onChange={(e) => onChange({ ...item, ml: numberOrZero(e.target.value) })}
          />
        </Field>
      );

    case "salt":
      return (
        <Field label="Sodium (mg)">
          <Input
            type="number"
            inputMode="numeric"
            disabled={disabled}
            value={item.sodiumMg}
            onChange={(e) =>
              onChange({ ...item, sodiumMg: numberOrZero(e.target.value) })
            }
          />
        </Field>
      );

    case "food":
      return (
        <div className="space-y-2">
          <Field label="Description">
            <Input
              disabled={disabled}
              value={item.description}
              onChange={(e) => onChange({ ...item, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Grams">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.grams ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onChange(setOptionalNumber(item, "grams", e.target.value))
                }
              />
            </Field>
            <Field label="Water (ml)">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.waterMl ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onChange(setOptionalNumber(item, "waterMl", e.target.value))
                }
              />
            </Field>
            <Field label="Sodium (mg)">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.sodiumMg ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onChange(setOptionalNumber(item, "sodiumMg", e.target.value))
                }
              />
            </Field>
            {sugarEnabled && (
              <Field label="Sugar (g)">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  disabled={disabled}
                  value={item.sugarG ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    onChange(setOptionalNumber(item, "sugarG", e.target.value))
                  }
                />
              </Field>
            )}
            {potassiumEnabled && (
              <Field label="Potassium (mg)">
                <Input
                  type="number"
                  inputMode="numeric"
                  disabled={disabled}
                  value={item.potassiumMg ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    onChange(setOptionalNumber(item, "potassiumMg", e.target.value))
                  }
                />
              </Field>
            )}
          </div>
        </div>
      );

    case "caffeine":
      return (
        <div className="space-y-2">
          <Field label="Description">
            <Input
              disabled={disabled}
              value={item.description}
              onChange={(e) => onChange({ ...item, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Caffeine (mg)">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.caffeineMg}
                onChange={(e) =>
                  onChange({ ...item, caffeineMg: numberOrZero(e.target.value) })
                }
              />
            </Field>
            <Field label="Volume (ml)">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.volumeMl ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onChange(setOptionalNumber(item, "volumeMl", e.target.value))
                }
              />
            </Field>
          </div>
        </div>
      );

    case "alcohol": {
      const stdDrinks = standardDrinksFromAbv(item.abvPercent, item.volumeMl);
      return (
        <div className="space-y-2">
          <Field label="Description">
            <Input
              disabled={disabled}
              value={item.description}
              onChange={(e) => onChange({ ...item, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="% ABV">
              <Input
                type="number"
                step="0.1"
                inputMode="decimal"
                disabled={disabled}
                value={item.abvPercent}
                onChange={(e) =>
                  onChange({ ...item, abvPercent: numberOrZero(e.target.value) })
                }
              />
            </Field>
            <Field label="Volume (ml)">
              <Input
                type="number"
                inputMode="numeric"
                disabled={disabled}
                value={item.volumeMl}
                onChange={(e) =>
                  onChange({ ...item, volumeMl: numberOrZero(e.target.value) })
                }
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            ≈ {stdDrinks.toFixed(1)} standard drink{stdDrinks.toFixed(1) === "1.0" ? "" : "s"}
          </p>
        </div>
      );
    }

    case "urination":
    case "defecation":
      return (
        <Field label="Amount">
          <Select
            disabled={disabled ?? false}
            value={item.amountEstimate ?? AMOUNT_NONE}
            onValueChange={(v) =>
              onChange(
                setOptionalEnum<typeof item, "amountEstimate", "small" | "medium" | "large">(
                  item,
                  "amountEstimate",
                  v === AMOUNT_NONE ? "" : v
                )
              )
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AMOUNT_NONE}>—</SelectItem>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
  }
}

// Radix Select disallows empty-string values, so we use a sentinel for the
// "unset" option and translate it back to "" at the boundary.
const AMOUNT_NONE = "__none__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function ParsedItemRow({
  item,
  index,
  onChange,
  onApprove,
  onReject,
  approved,
  disabled,
}: ParsedItemRowProps) {
  const token = VOICE_ITEM_COLOR[item.kind];
  const c: ColorClass =
    COLOR_CLASS[token] ?? { bar: "bg-muted", ring: "ring-muted/30", chip: "bg-muted" };
  const label = VOICE_ITEM_LABEL[item.kind];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card transition-opacity",
        approved === false && "opacity-40",
        approved === true && "ring-1",
        approved === true && c.ring
      )}
      data-testid={`voice-item-${index}`}
    >
      <div className={cn("absolute left-0 top-0 h-full w-1.5", c.bar)} />
      <div className="flex items-start gap-3 p-3 pl-5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                c.chip
              )}
            >
              {label}
            </span>
            {approved === true && (
              <span className="text-xs text-muted-foreground">approved</span>
            )}
            {approved === false && (
              <span className="text-xs text-muted-foreground">rejected</span>
            )}
          </div>
          <ItemEditor
            item={item}
            onChange={onChange}
            disabled={disabled || approved !== null}
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            size="icon"
            variant={approved === true ? "default" : "outline"}
            className="h-8 w-8"
            disabled={disabled}
            onClick={onApprove}
            aria-label={`Approve ${label}`}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={approved === false ? "destructive" : "outline"}
            className="h-8 w-8"
            disabled={disabled}
            onClick={onReject}
            aria-label={`Reject ${label}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
