"use client";

import { useCallback, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@intake/ui/sheet";
import { useToast } from "@intake/ui/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { reportSaveError } from "@/lib/db-recovery";
import { formatAmount } from "@/lib/utils";
import { DOMAIN_CLASSES, domainColor, type Domain } from "@/lib/domain-colors";
import type { ShellIconName } from "@/lib/nav-routes";
import { ShellIcon } from "@/components/shell/shell-icon";
import { LogFormScope } from "@/components/log-form-scope";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";

export type LogFormKey = "drink" | "food" | "bp" | "weight" | "wee" | "bowel";

interface LogType {
  label: string;
  icon: ShellIconName;
  domain: Domain;
  /** The existing home-screen card that owns this form. */
  Form: ComponentType;
}

export const LOG_TYPES: Record<LogFormKey, LogType> = {
  drink: { label: "Drink", icon: "cup", domain: "water", Form: LiquidsCard },
  food: { label: "Food", icon: "food", domain: "sodium", Form: FoodSaltCard },
  bp: { label: "Blood pressure", icon: "bp", domain: "bp", Form: BloodPressureCard },
  weight: { label: "Weight", icon: "weight", domain: "weight", Form: WeightCard },
  wee: { label: "Urination", icon: "wee", domain: "bath", Form: UrinationCard },
  bowel: { label: "Defecation", icon: "bowel", domain: "bath", Form: DefecationCard },
};

const LOG_KEYS = Object.keys(LOG_TYPES) as LogFormKey[];

export const WATER_STEP_ML = 50;
const WATER_MIN_ML = WATER_STEP_ML;
const WATER_MAX_ML = 2000;

/** Water: a stepper and a one-tap Add, the quickest log in the app. Closes the sheet once logged. */
function WaterRow({ onLogged }: { onLogged: () => void }) {
  const waterIncrement = useSettingsStore((s) => s.waterIncrement);
  const water = useIntake("water");
  const { toast } = useToast();
  const [ml, setMl] = useState(waterIncrement);
  const inFlight = useRef(false);

  const add = async () => {
    if (inFlight.current || ml <= 0) return;
    inFlight.current = true;
    try {
      await water.addRecord(ml, "manual");
      toast({ title: `Added ${formatAmount(ml, "ml")}`, description: "Water intake recorded", variant: "success" });
      onLogged();
    } catch (err) {
      reportSaveError("water", err);
      toast({ title: "Error", description: "Failed to record intake", variant: "destructive" });
    } finally {
      inFlight.current = false;
    }
  };

  const cell = "flex items-center justify-center border-l border-line";
  return (
    <div
      className="grid h-12 grid-cols-[1fr_44px_84px_44px_76px] border border-line bg-chrome"
      style={{ "--c": domainColor("water") } as CSSProperties}
    >
      <span className="flex items-center gap-2 px-2.5 text-sm font-medium">
        <ShellIcon name="drop" size={20} className="text-water" />
        <span>Water</span>
      </span>
      <button
        type="button"
        className={`${cell} text-xl`}
        aria-label={`${WATER_STEP_ML} ml less`}
        disabled={ml <= WATER_MIN_ML}
        onClick={() => setMl((v) => Math.max(WATER_MIN_ML, v - WATER_STEP_ML))}
      >
        −
      </button>
      <span className={`${cell} num text-[0.9375rem]`} data-testid="log-water-amount">
        {ml} ml
      </span>
      <button
        type="button"
        className={`${cell} text-xl`}
        aria-label={`${WATER_STEP_ML} ml more`}
        disabled={ml >= WATER_MAX_ML}
        onClick={() => setMl((v) => Math.min(WATER_MAX_ML, v + WATER_STEP_ML))}
      >
        +
      </button>
      <button
        type="button"
        className={`${cell} bg-foreground text-sm font-semibold text-background`}
        aria-label={`Add ${ml} ml water`}
        onClick={() => void add()}
      >
        Add
      </button>
    </div>
  );
}

interface LogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Log sheet: quick water plus a key for every other log. A key opens the
 * existing form for that log (the same card the home screen shows) inside
 * the sheet, so there is one form per log type across the app.
 */
export function LogSheet({ open, onOpenChange }: LogSheetProps) {
  const [form, setForm] = useState<LogFormKey | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setForm(null);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // A successful log closes the sheet, as in the prototype.
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  const active = form ? LOG_TYPES[form] : null;
  const ActiveForm = active?.Form;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        open={open}
        className="flex max-h-[80%] flex-col gap-0 bg-panel p-0 data-[form=true]:max-h-[88%]"
        data-form={form ? "true" : undefined}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-chrome pl-2.5 pr-12">
          {active && (
            <button
              type="button"
              className="-ml-1 flex h-11 w-11 items-center justify-center"
              aria-label="Back to log keys"
              onClick={() => setForm(null)}
            >
              <ShellIcon name="back" size={20} />
            </button>
          )}
          <SheetTitle className="text-xs font-semibold uppercase tracking-[0.06em]">Log</SheetTitle>
          {active && <span className="font-mono text-xs text-muted-foreground">· {active.label}</span>}
          <SheetDescription className="sr-only">
            {active ? `Log ${active.label.toLowerCase()}` : "Add water or pick what to log"}
          </SheetDescription>
        </div>

        {ActiveForm ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-2.5" data-testid="log-sheet-form">
            <LogFormScope idPrefix="log-sheet-" onLogged={close}>
              <ActiveForm />
            </LogFormScope>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-2.5">
            <WaterRow onLogged={close} />
            <div className="grid grid-cols-3 gap-1.5">
              {LOG_KEYS.map((k) => {
                const t = LOG_TYPES[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`Log ${t.label.toLowerCase()}`}
                    onClick={() => setForm(k)}
                    className="flex min-h-14 flex-col items-center justify-center gap-[5px] whitespace-nowrap border border-line bg-chrome px-1 text-foreground hover:border-muted-foreground active:bg-foreground/15"
                  >
                    <ShellIcon name={t.icon} size={20} className={DOMAIN_CLASSES[t.domain].text} />
                    <span className="text-[0.8125rem] font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

