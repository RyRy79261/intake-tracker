"use client";

import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { useFieldId } from "@/components/log-form-scope";
import type { DrinkEditForm } from "@/hooks/use-drink-edit";

/**
 * The fields of the drink edit form (see useDrinkEdit): amount, then name,
 * caffeine, ABV and sugar for a drink, or a hint for a meal's water.
 */
export function DrinkEditFields({ form }: { form: DrinkEditForm }) {
  const fid = useFieldId();
  const { values, setField, kind, sugarEnabled } = form;
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={fid("edit-liquid-amount")} className="text-xs text-muted-foreground">Amount (ml)</Label>
        <Input id={fid("edit-liquid-amount")} type="number" value={values.amount} onChange={(e) => setField("amount", e.target.value)} className="h-8 text-sm" />
      </div>
      {kind === "meal-water" ? (
        <p className="text-xs text-muted-foreground" data-testid="liquid-edit-meal-hint">
          Water from a meal. Edit the meal&apos;s nutrients on the Food card; changing the time here moves the whole meal.
        </p>
      ) : kind === "other" ? null : (
        <>
          <div className="space-y-1">
            <Label htmlFor={fid("edit-liquid-beverage")} className="text-xs text-muted-foreground">
              Beverage name <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id={fid("edit-liquid-beverage")}
              type="text"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fid("edit-liquid-caffeine")} className="text-xs text-muted-foreground">
              Caffeine (mg) <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id={fid("edit-liquid-caffeine")}
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={values.caffeineMg}
              onChange={(e) => setField("caffeineMg", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fid("edit-liquid-alcohol")} className="text-xs text-muted-foreground">
              Alcohol (% ABV) <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id={fid("edit-liquid-alcohol")}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={values.abvPercent}
              onChange={(e) => setField("abvPercent", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {sugarEnabled && (
            <div className="space-y-1">
              <Label htmlFor={fid("edit-liquid-sugar")} className="text-xs text-muted-foreground">
                Sugar (g) <span className="font-normal">(optional)</span>
              </Label>
              <Input
                id={fid("edit-liquid-sugar")}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={values.sugarG}
                onChange={(e) => setField("sugarG", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
