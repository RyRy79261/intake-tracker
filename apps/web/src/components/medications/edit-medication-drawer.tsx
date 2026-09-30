"use client";

import { useState, useEffect, useId } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@intake/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Switch } from "@intake/ui/switch";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import {
  usePhasesForPrescription,
  useSchedulesForPhase,
  useUpdatePrescription,
  useDeletePrescription,
  usePrescriptions,
  useUpdatePhase,
  useStartNewPhase,
  useInventoryForPrescription,
  useUpdateInventoryItem,
  useAdjustStock,
} from "@/hooks/use-medication-queries";
import { getMaintenancePhase, getActiveTitrationPhase } from "@/lib/medication-ui-utils";
import type { Prescription, FoodInstruction, InventoryItem, PillShape, CompoundStrength } from "@/lib/db";
import { Plus, Clock, Edit2, Check, X, Trash2 } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { WarnBox } from "@/components/medications/ward-bits";
import { useMedicineSearch } from "@/hooks/use-medicine-search";
import {
  MedicineLookupPanel,
  useMedicineLookup,
  type ApplyContext,
} from "@/components/medications/medicine-lookup-panel";
import { applyToDetails, type LookupGroup } from "@/components/medications/medicine-lookup";
import { STRENGTH_UNITS, convertStrength, normalizeStrengthUnit, parseStrength } from "@intake/core/strength";
import { compoundSum, formatCompoundShort, isCombo } from "@intake/core/compound";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { findActiveBrand, unitsMatch } from "@/lib/dose-preview";
import { DoseAmountInput, DosePreviewLine } from "@/components/medications/dose-amount-field";
import { PillIcon } from "@/components/medications/pill-icon";
import { PILL_SHAPES, PRESET_COLORS } from "@/components/medications/add-medication-steps/types";
import { cn } from "@/lib/utils";
import { weekDayOrder } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";

const SELECT_CLASS =
  "flex h-10 rounded-none border border-input bg-background text-foreground px-2.5 py-1 text-[0.9375rem] font-mono";

/** Section heading inside the drawer tabs. */
const H3 = "text-[0.9375rem] font-semibold";
/** Field label (`.flabel`). */
const LABEL = "text-[0.8125rem] font-normal text-muted-foreground";
/** 44px icon button (`.ibtn`). */
const ICON_BTN =
  "inline-flex h-10 w-11 shrink-0 items-center justify-center text-muted-foreground hover:bg-foreground/6 hover:text-foreground " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** The controlled unit list, plus a legacy free-text unit so it isn't lost. */
function unitOptions(current: string | undefined): string[] {
  const units: string[] = [...STRENGTH_UNITS];
  if (current && !normalizeStrengthUnit(current)) units.push(current);
  return units;
}

interface PrescriptionViewDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrescriptionViewDrawer({ prescription, open, onOpenChange }: PrescriptionViewDrawerProps) {
  const prescriptions = usePrescriptions();
  const currentPrescription = prescriptions.find(p => p.id === prescription?.id) || prescription;

  if (!currentPrescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex max-h-[90dvh] flex-col bg-panel shadow-[inset_0_3px_0_hsl(var(--meds))]">
        <DrawerHeader className="shrink-0 border-b border-line text-left">
          <DrawerTitle className="text-base font-semibold">{currentPrescription.genericName}</DrawerTitle>
          <p className="text-[0.8125rem] text-muted-foreground">
            {currentPrescription.indication || "Prescription"}
          </p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="schedule" className="w-full h-full flex flex-col">
            <div className="shrink-0 px-4 pt-3">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="medicine">Medicine</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-5 pt-3 text-sm">
              <TabsContent value="schedule" className="mt-0">
                <ScheduleTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="medicine" className="mt-0">
                <MedicineTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="details" className="mt-0">
                <DetailsTab prescription={currentPrescription} onOpenChange={onOpenChange} />
              </TabsContent>

              <TabsContent value="info" className="mt-0">
                <InfoTab prescription={currentPrescription} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// Schedule Tab — edit the maintenance ("baseline") schedule directly.
// Formal dosage changes go through the Titrations tab; this is for minor tweaks.
// ============================================================================

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface SchedRow {
  id?: string;
  time: string;
  dosage: string;
  daysOfWeek: number[];
}

function ScheduleTab({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const maintenancePhase = getMaintenancePhase(phases);
  const activeTitration = getActiveTitrationPhase(phases);
  const dbSchedules = useSchedulesForPhase(maintenancePhase?.id);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const updatePhase = useUpdatePhase();
  const startNewPhase = useStartNewPhase();
  // Pill math divides each dose by the active brand's strength as plain
  // numbers, so the schedule must be in the brand's unit.
  const activeBrand = findActiveBrand(useInventoryForPrescription(prescription.id));
  const unitSelectId = useId();

  const [unit, setUnit] = useState("mg");
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>("none");
  const [rows, setRows] = useState<SchedRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Hydrate from the DB whenever the maintenance phase or its schedules change,
  // unless the user has unsaved edits in progress.
  useEffect(() => {
    if (dirty) return;
    setUnit(maintenancePhase?.unit ?? "mg");
    setFoodInstruction(maintenancePhase?.foodInstruction ?? "none");
    setRows(
      dbSchedules.length > 0
        ? [...dbSchedules]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((s) => ({
              id: s.id,
              time: s.time,
              dosage: String(s.dosage),
              daysOfWeek: s.daysOfWeek,
            }))
        : [],
    );
  }, [maintenancePhase, dbSchedules, dirty]);

  const updateRow = (i: number, patch: Partial<SchedRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addRow = () => {
    setRows((prev) => [...prev, { time: "20:00", dosage: "", daysOfWeek: [...ALL_DAYS] }]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const toggleDay = (i: number, day: number) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const has = r.daysOfWeek.includes(day);
        return {
          ...r,
          daysOfWeek: has
            ? r.daysOfWeek.filter((d) => d !== day)
            : [...r.daysOfWeek, day].sort((a, b) => a - b),
        };
      }),
    );
    setDirty(true);
  };

  // Changing the unit converts every dose so the amount taken stays the same
  // (0.1 mg ⇒ 100 mcg) instead of relabelling it — a relabel is what made a
  // mcg-entered dose deduct 1000× the pills.
  const changeUnit = (next: string) => {
    setRows((prev) =>
      prev.map((r) => {
        const n = parseFloat(r.dosage);
        const converted = Number.isFinite(n) ? convertStrength(n, unit, next) : null;
        return converted === null ? r : { ...r, dosage: String(converted) };
      }),
    );
    setUnit(next);
    setDirty(true);
  };

  const isRowValid = (r: SchedRow) => {
    const dose = parseFloat(r.dosage);
    return Number.isFinite(dose) && dose > 0 && r.daysOfWeek.length > 0;
  };
  const validRows = rows.filter(isRowValid);
  // Save requires *every* row to be valid — otherwise a half-edited row would
  // be silently dropped from the mutation.
  const allRowsValid = rows.length > 0 && rows.every(isRowValid);
  const unitMismatch = !!activeBrand && !unitsMatch(unit, activeBrand.unit);
  const isSaving = updatePhase.isPending || startNewPhase.isPending;
  const canSave = dirty && allRowsValid && !unitMismatch && !isSaving;

  const handleSave = async () => {
    if (!allRowsValid || unitMismatch) return;
    if (maintenancePhase) {
      await updatePhase.mutateAsync({
        id: maintenancePhase.id,
        unit,
        foodInstruction,
        schedules: validRows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          time: r.time,
          dosage: parseFloat(r.dosage),
          daysOfWeek: r.daysOfWeek,
        })),
      });
    } else {
      await startNewPhase.mutateAsync({
        prescriptionId: prescription.id,
        type: "maintenance",
        unit,
        foodInstruction,
        startDate: Date.now(),
        schedules: validRows.map((r) => ({
          time: r.time,
          dosage: parseFloat(r.dosage),
          daysOfWeek: r.daysOfWeek,
        })),
      });
    }
    setDirty(false);
  };

  const handleReset = () => setDirty(false);

  return (
    <div className="flex flex-col gap-4 pb-2">
      {activeTitration && (
        <WarnBox title="On titration">
          <p>
            An active titration is currently in effect — today&apos;s doses follow
            the titration plan. Changes here update your baseline (maintenance)
            schedule, which resumes when the titration ends.
          </p>
        </WarnBox>
      )}

      <p className="text-[0.8125rem] text-muted-foreground">
        Edit the day-to-day schedule for minor tweaks. For a planned dose
        increase or decrease, create a plan in the Titrations tab instead.
      </p>

      {/* Unit */}
      <div className="space-y-1.5">
        <Label htmlFor={unitSelectId} className={LABEL}>Dosage unit</Label>
        <select
          id={unitSelectId}
          value={unit}
          onChange={(e) => changeUnit(e.target.value)}
          className={cn(SELECT_CLASS, "w-28")}
        >
          {unitOptions(unit).map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        {unitMismatch && (
          <p role="alert" className="text-[0.8125rem] text-bp">
            {activeBrand.brandName} is counted in {activeBrand.unit} — doses must be in{" "}
            {activeBrand.unit} too.
          </p>
        )}
      </div>

      {/* Food instruction */}
      <div className="space-y-1.5">
        <Label className={LABEL}>Food instruction</Label>
        <div className="flex border border-input" role="radiogroup" aria-label="Food instruction">
          {(["before", "after", "none"] as FoodInstruction[]).map((fi) => (
            <button
              key={fi}
              type="button"
              role="radio"
              aria-checked={foodInstruction === fi}
              className={cn(
                "min-h-11 flex-1 border-l border-input px-2 text-[0.8125rem] font-medium first:border-l-0",
                foodInstruction === fi ? "bg-foreground text-background" : "hover:bg-foreground/6",
              )}
              onClick={() => { setFoodInstruction(fi); setDirty(true); }}
            >
              {fi === "none" ? "No instruction" : fi === "before" ? "Before eating" : "After eating"}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule rows */}
      <div className="space-y-2">
        <Label className={LABEL}>Daily doses</Label>
        {rows.length === 0 && (
          <p className="border border-dashed border-line p-3 text-center text-[0.8125rem] text-muted-foreground">
            No doses scheduled. Add a time below.
          </p>
        )}
        {rows.map((row, idx) => (
          <div key={row.id ?? `new-${idx}`} className="flex flex-col gap-2 border border-line bg-background p-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                aria-label="Time"
                value={row.time}
                onChange={(e) => updateRow(idx, { time: e.target.value })}
                className="min-w-0 flex-1 font-mono"
              />
              <DoseAmountInput
                dosage={row.dosage}
                onDosageChange={(dosage) => updateRow(idx, { dosage })}
                unit={unit}
                brand={activeBrand}
                className="w-24 font-mono"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className={ICON_BTN}
                aria-label="Remove dose"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <DosePreviewLine dosage={row.dosage} unit={unit} brand={activeBrand} />
            <div className="grid grid-cols-7 gap-[3px]" role="group" aria-label="Days">
              {weekDayOrder(weekStartsOn).map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={row.daysOfWeek.includes(day)}
                  onClick={() => toggleDay(idx, day)}
                  className={cn(
                    "min-h-11 border text-xs font-medium",
                    row.daysOfWeek.includes(day)
                      ? "border-foreground bg-foreground text-background"
                      : "border-line text-muted-foreground hover:bg-foreground/6",
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={addRow}
        >
          <Plus /> Add time
        </Button>
      </div>

      {dirty && (
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-panel pt-2.5">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleReset}
            disabled={isSaving}
          >
            Discard
          </Button>
          <Button
            className="flex-[2]"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isSaving ? <Spinner /> : "Save schedule"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Medicine Tab — edit a stocked brand: name, strength, unit, pill look and
// refill alerts. Everything else the wizard set can be corrected here without
// archiving the box and losing its stock ledger.
// ============================================================================

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function strengthLabel(item: Pick<InventoryItem, "strength" | "unit" | "compounds">): string {
  return isCombo(item) ? formatCompoundShort(item.compounds, item.unit) : `${item.strength}${item.unit}`;
}

function MedicineTab({ prescription }: { prescription: Prescription }) {
  const inventory = useInventoryForPrescription(prescription.id);
  const phases = usePhasesForPrescription(prescription.id);
  const phaseUnit = (selectEffectivePhase(phases) ?? getMaintenancePhase(phases))?.unit;
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = inventory
    .filter((i) => isLive(i) && !i.isArchived)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));

  if (items.length === 0) {
    return (
      <p className="border border-dashed border-line p-3 text-center text-[0.8125rem] text-muted-foreground">
        No medicine stocked for this prescription.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-2">
      {items.map((item) =>
        editingId === item.id ? (
          <MedicineEditForm
            key={item.id}
            item={item}
            phaseUnit={phaseUnit}
            onDone={() => setEditingId(null)}
          />
        ) : (
          <div
            key={item.id}
            className={cn(
              "flex min-h-[52px] items-center gap-2.5 border border-line bg-background py-1.5 pl-2.5 pr-1.5",
              item.isActive && "shadow-[inset_3px_0_0_hsl(var(--meds))]",
            )}
          >
            <PillIcon shape={item.pillShape} color={item.pillColor} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {item.brandName} <span className="font-mono font-normal">{strengthLabel(item)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.isActive ? "In use · " : ""}
                {round4(item.currentStock ?? 0)} on hand
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Edit ${item.brandName}`}
              onClick={() => setEditingId(item.id)}
            >
              <Edit2 /> Edit
            </Button>
          </div>
        ),
      )}
    </div>
  );
}

/** How the pills on hand are read after a strength change. */
type StockChoice = "keepPills" | "keepAmount";

/** Blank ⇒ `undefined` (not set); a whole number ≥ 0; anything else ⇒ `null`. */
function parseThreshold(text: string): number | undefined | null {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function MedicineEditForm({
  item,
  phaseUnit,
  onDone,
}: {
  item: InventoryItem;
  phaseUnit: string | undefined;
  onDone: () => void;
}) {
  const ids = useId();
  const updateItem = useUpdateInventoryItem();
  const adjustStock = useAdjustStock();
  const combo = isCombo(item);

  const [brandName, setBrandName] = useState(item.brandName);
  const [strengthText, setStrengthText] = useState(String(item.strength));
  const [compoundText, setCompoundText] = useState(
    (item.compounds ?? []).map((c) => String(c.strength)),
  );
  const [unit, setUnit] = useState(item.unit);
  const [pillShape, setPillShape] = useState<PillShape>(item.pillShape);
  const [pillColor, setPillColor] = useState(item.pillColor);
  const [refillDays, setRefillDays] = useState(item.refillAlertDays?.toString() ?? "");
  const [refillPills, setRefillPills] = useState(item.refillAlertPills?.toString() ?? "");
  const [askStock, setAskStock] = useState(false);

  // Strength: a combo is the sum of its compounds (the pill-math denominator);
  // a single pill goes through the shared parser ("1,000" ⇒ 1000, ".5" ⇒ 0.5).
  const compounds: CompoundStrength[] | undefined = combo
    ? (item.compounds ?? []).map((c, i) => ({
        name: c.name,
        strength: parseStrength(compoundText[i] ?? "")?.value ?? 0,
      }))
    : undefined;
  // A unit typed into the strength text ("500 mcg") is converted to the unit
  // select rather than dropped — otherwise it would save as 500 mg.
  const parsedStrength = combo ? null : parseStrength(strengthText);
  const typedUnit = /[a-zµμ]/i.test(strengthText) ? parsedStrength?.unit : undefined;
  const typedStrength =
    parsedStrength && typedUnit && !unitsMatch(typedUnit, unit)
      ? convertStrength(parsedStrength.value, typedUnit, unit)
      : parsedStrength?.value ?? null;
  const strength = compounds
    ? compounds.every((c) => c.strength > 0) ? round4(compoundSum(compounds)) : null
    : typedStrength;
  const days = parseThreshold(refillDays);
  const pills = parseThreshold(refillPills);

  const errors: string[] = [];
  if (brandName.trim() === "") errors.push("Enter the brand name");
  if (parsedStrength && typedUnit && typedStrength === null) {
    errors.push(`A ${typedUnit} strength can't be converted to ${unit}`);
  } else if (strength === null) {
    errors.push("Enter a strength above 0");
  }
  if (phaseUnit && !unitsMatch(unit, phaseUnit)) {
    errors.push(`This prescription is dosed in ${phaseUnit}; the medicine must use the same unit.`);
  }
  if (days === null || pills === null) errors.push("Refill alerts must be whole numbers, 0 or more");
  // An alert that's already set stays set (0 alerts only once you run out) —
  // blanking the field would otherwise silently keep the old value.
  if (
    (days === undefined && item.refillAlertDays !== undefined) ||
    (pills === undefined && item.refillAlertPills !== undefined)
  ) {
    errors.push("Keep a number in each refill alert — use 0 to alert only when you run out");
  }

  // What the pills on hand come to after the change. `oldInNewUnit` is null
  // when the old strength can't be expressed in the new unit.
  const stock = round4(item.currentStock ?? 0);
  const strengthChanged =
    strength !== null && (strength !== item.strength || !unitsMatch(unit, item.unit));
  const oldInNewUnit = unitsMatch(unit, item.unit)
    ? item.strength
    : convertStrength(item.strength, item.unit, unit);
  const amountOnHand = oldInNewUnit !== null ? round4(stock * oldInNewUnit) : null;
  const pillsForSameAmount =
    amountOnHand !== null && strength ? round4(amountOnHand / strength) : null;

  const isSaving = updateItem.isPending || adjustStock.isPending;

  const save = async (choice?: StockChoice) => {
    if (errors.length > 0 || strength === null || days === null || pills === null) return;
    if (strengthChanged && stock !== 0 && !choice) {
      setAskStock(true);
      return;
    }
    await updateItem.mutateAsync({
      id: item.id,
      updates: {
        brandName: brandName.trim(),
        strength,
        unit: normalizeStrengthUnit(unit) ?? unit,
        pillShape,
        pillColor,
        ...(compounds && { compounds }),
        ...(days !== undefined && { refillAlertDays: days }),
        ...(pills !== undefined && { refillAlertPills: pills }),
      },
    });
    // Recorded as a new 'adjusted' entry: the refill that brought the
    // pills in stays as it was.
    if (choice === "keepAmount" && pillsForSameAmount !== null) {
      const delta = round4(pillsForSameAmount - stock);
      if (delta !== 0) {
        await adjustStock.mutateAsync({
          inventoryItemId: item.id,
          amount: delta,
          note: `Strength changed from ${item.strength}${item.unit} to ${strength}${unit}`,
          type: "adjusted",
        });
      }
    }
    setAskStock(false);
    onDone();
  };

  if (askStock && strength !== null) {
    return (
      <div className="flex flex-col gap-3 border border-line bg-background p-3">
        <p className="text-sm">
          You have {stock} on hand. Is that still the number of pills, or should the
          count change so the same amount of medicine is on hand at {strength}{unit} a pill?
        </p>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" disabled={isSaving} onClick={() => save("keepPills")}>
            Keep {stock} pills
          </Button>
          {pillsForSameAmount !== null && (
            <Button size="sm" variant="outline" disabled={isSaving} onClick={() => save("keepAmount")}>
              Keep {amountOnHand}{unit} on hand ({pillsForSameAmount} pills)
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={isSaving} onClick={() => setAskStock(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-line bg-background p-3 shadow-[inset_3px_0_0_hsl(var(--meds))]">
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-brand`} className={LABEL}>Brand name</Label>
        <Input id={`${ids}-brand`} value={brandName} onChange={(e) => setBrandName(e.target.value)} />
      </div>

      <div className="flex items-end gap-2">
        {combo ? (
          (item.compounds ?? []).map((c, i) => (
            <div key={i} className="space-y-1.5 flex-1">
              <Label htmlFor={`${ids}-compound-${i}`} className={LABEL}>{c.name || "Compound"}</Label>
              <Input
                id={`${ids}-compound-${i}`}
                inputMode="decimal"
                value={compoundText[i] ?? ""}
                onChange={(e) =>
                  setCompoundText((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))
                }
                className="font-mono"
              />
            </div>
          ))
        ) : (
          <div className="space-y-1.5 flex-1">
            <Label htmlFor={`${ids}-strength`} className={LABEL}>Strength</Label>
            <Input
              id={`${ids}-strength`}
              inputMode="decimal"
              value={strengthText}
              onChange={(e) => setStrengthText(e.target.value)}
              className="font-mono"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-unit`} className={LABEL}>Unit</Label>
          <select
            id={`${ids}-unit`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={cn(SELECT_CLASS, "w-24")}
          >
            {unitOptions(unit).map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      {strength !== null && (
        <p className="font-mono text-[0.8125rem] text-muted-foreground">
          1 pill = {strength} {unit}
        </p>
      )}

      <div className="space-y-1.5">
        <Label className={LABEL}>Pill look</Label>
        <div className="flex flex-wrap gap-1.5">
          {PILL_SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-label={s.label}
              aria-pressed={pillShape === s.value}
              onClick={() => setPillShape(s.value)}
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center border",
                pillShape === s.value ? "border-foreground bg-foreground/10 shadow-[inset_0_0_0_1px_hsl(var(--fg))]" : "border-line",
              )}
            >
              <PillIcon shape={s.value} color={pillColor} size={20} />
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={pillColor === c}
              onClick={() => setPillColor(c)}
              className={cn(
                "h-11 w-11 border",
                pillColor === c ? "border-foreground shadow-[0_0_0_2px_hsl(var(--panel)),0_0_0_3px_hsl(var(--fg))]" : "border-[#5E5A70]",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor={`${ids}-days`} className={LABEL}>Alert when days left</Label>
          <Input
            id={`${ids}-days`}
            type="number"
            min="0"
            value={refillDays}
            onChange={(e) => setRefillDays(e.target.value)}
            placeholder="None"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor={`${ids}-pills`} className={LABEL}>Alert when pills left</Label>
          <Input
            id={`${ids}-pills`}
            type="number"
            min="0"
            value={refillPills}
            onChange={(e) => setRefillPills(e.target.value)}
            placeholder="None"
            className="font-mono"
          />
        </div>
      </div>

      {errors.map((e) => (
        <p key={e} role="alert" className="text-[0.8125rem] text-bp">{e}</p>
      ))}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          className="flex-[2]"
          onClick={() => save()}
          disabled={errors.length > 0 || isSaving}
        >
          {isSaving ? <Spinner /> : "Save medicine"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Details Tab — name, indication, notes, active toggle, delete.
// ============================================================================

/** What the AI lookup offers on Prescription Details (prototype `rxEdit`). */
const DETAILS_LOOKUP_GROUPS: LookupGroup[] = ["generic", "compounds", "indication", "food"];
/** Offered groups this form has no field for, and where they are edited. */
const DETAILS_LOOKUP_ELSEWHERE: Partial<Record<LookupGroup, string>> = {
  compounds: "Set each brand's compounds on the Medicine tab",
  food: "Set the food instruction on the Schedule tab",
};

function DetailsTab({ prescription, onOpenChange }: { prescription: Prescription, onOpenChange: (open: boolean) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(prescription.genericName);
  const [indication, setIndication] = useState(prescription.indication ?? "");
  const [notes, setNotes] = useState(prescription.notes || "");
  const [isActive, setIsActive] = useState(prescription.isActive);

  const updatePrescription = useUpdatePrescription();
  const deletePrescription = useDeletePrescription();
  const lookup = useMedicineLookup();
  const { clear: clearLookup } = lookup;

  useEffect(() => {
    setName(prescription.genericName);
    setIndication(prescription.indication ?? "");
    setNotes(prescription.notes || "");
    setIsActive(prescription.isActive);
    setIsEditing(false);
    clearLookup();
  }, [prescription, clearLookup]);

  const applyLookup = ({ groups, result }: ApplyContext) => {
    const p = applyToDetails(groups, result);
    if (p.name !== undefined) setName(p.name);
    if (p.indication !== undefined) setIndication(p.indication);
  };

  const handleSave = async () => {
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: { genericName: name, indication, notes, isActive },
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm("Permanently delete this prescription and all its history? This cannot be undone.")) {
      await deletePrescription.mutateAsync(prescription.id);
      onOpenChange(false);
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    setIsActive(checked);
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: { isActive: checked },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className={H3}>Prescription Details</h3>
        {!isEditing ? (
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            <Edit2 /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" aria-label="Cancel editing" onClick={() => setIsEditing(false)}>
              <X /> Cancel
            </Button>
            <Button size="sm" aria-label="Save details" onClick={handleSave} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Spinner /> : <Check />} Save
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-3">
          <MedicineLookupPanel
            lookup={lookup}
            groups={DETAILS_LOOKUP_GROUPS}
            fallbackQuery={name}
            placeholder={`e.g. ${prescription.genericName}`}
            unavailable={DETAILS_LOOKUP_ELSEWHERE}
            onApply={applyLookup}
          />
          <div className="flex items-center justify-between gap-3 border border-line bg-background p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Active Prescription</Label>
              <p className="text-[0.8125rem] text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL}>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL}>Reason for use</Label>
            <Input value={indication} onChange={(e) => setIndication(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL}>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 border border-line bg-background p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Active Prescription</Label>
              <p className="text-[0.8125rem] text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={handleToggleActive} />
          </div>

          <div>
            <p className="mb-0.5 text-[0.8125rem] text-muted-foreground">Reason for use</p>
            <p className="text-sm font-medium">{prescription.indication || "None specified"}</p>
          </div>

          <div>
            <p className="mb-0.5 text-[0.8125rem] text-muted-foreground">Notes</p>
            <p className="border border-line bg-background p-2.5 text-sm">
              {prescription.notes || "No notes added."}
            </p>
          </div>

          <div className="border-t border-line pt-3">
            <Button
              variant="outline"
              className="w-full border-bp text-bp"
              onClick={handleDelete}
              disabled={deletePrescription.isPending}
            >
              {deletePrescription.isPending ? <Spinner className="size-4" /> : "Delete Prescription"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Info Tab — AI-assisted contraindications & warnings.
// ============================================================================

function InfoTab({ prescription }: { prescription: Prescription }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAiData, setPendingAiData] = useState<{ contraindications: string[], warnings: string[] } | null>(null);
  const [isEditingAiData, setIsEditingAiData] = useState(false);
  const [editContraindications, setEditContraindications] = useState("");
  const [editWarnings, setEditWarnings] = useState("");

  const updatePrescription = useUpdatePrescription();
  const searchMutation = useMedicineSearch();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await searchMutation.mutateAsync(prescription.genericName);
      if (result) {
        setPendingAiData({
          contraindications: result.contraindications || [],
          warnings: result.warnings || [],
        });
      }
    } catch (e) {
      console.error("Failed to refresh AI data", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAccept = async () => {
    if (!pendingAiData) return;
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: {
        contraindications: pendingAiData.contraindications,
        warnings: pendingAiData.warnings,
      },
    });
    setPendingAiData(null);
  };

  const handleReject = () => {
    setPendingAiData(null);
    setIsEditingAiData(false);
  };

  const startEditing = () => {
    if (!pendingAiData) return;
    setEditContraindications(pendingAiData.contraindications.join("\n"));
    setEditWarnings(pendingAiData.warnings.join("\n"));
    setIsEditingAiData(true);
  };

  const saveEdits = async () => {
    const newContraindications = editContraindications.split("\n").map(s => s.trim()).filter(Boolean);
    const newWarnings = editWarnings.split("\n").map(s => s.trim()).filter(Boolean);

    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: {
        contraindications: newContraindications,
        warnings: newWarnings,
      },
    });
    setPendingAiData(null);
    setIsEditingAiData(false);
  };

  if (pendingAiData) {
    if (isEditingAiData) {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className={H3}>Edit AI Information</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[0.8125rem] text-bp">Contraindications (one per line)</Label>
              <Textarea
                value={editContraindications}
                onChange={(e) => setEditContraindications(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[0.8125rem] text-sodium">Warnings (one per line)</Label>
              <Textarea
                value={editWarnings}
                onChange={(e) => setEditWarnings(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button size="sm" variant="outline" onClick={() => setIsEditingAiData(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEdits} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Spinner className="size-3" /> : "Save"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className={H3}>Review AI Information</h3>
        </div>

        <div className="flex flex-col gap-4 border border-line bg-background p-3 shadow-[inset_3px_0_0_hsl(var(--ai))]">
          <div className="space-y-2">
            <h4 className="text-[0.8125rem] font-semibold text-bp">New Contraindications</h4>
            {pendingAiData.contraindications.length > 0 ? (
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                {pendingAiData.contraindications.map((c, i) => (
                  <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None found.</p>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-[0.8125rem] font-semibold text-sodium">New Warnings</h4>
            {pendingAiData.warnings.length > 0 ? (
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                {pendingAiData.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None found.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button size="sm" variant="outline" onClick={handleReject}>Reject</Button>
            <Button size="sm" variant="outline" onClick={startEditing}>Edit</Button>
            <Button size="sm" onClick={handleAccept} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Spinner className="size-3" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className={H3}>AI Information</h3>
        <Button size="sm" variant="outline" className="border-ai text-ai" onClick={handleRefresh} disabled={isRefreshing || updatePrescription.isPending}>
          {isRefreshing || updatePrescription.isPending ? <Spinner className="size-3" /> : <Clock className="w-3 h-3" />}
          Refresh AI Data
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-[0.9375rem] font-semibold text-bp">Contraindications</h3>
        {prescription.contraindications && prescription.contraindications.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.contraindications.map((c, i) => (
              <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>
            ))}
          </ul>
        ) : (
          <p className="border border-line bg-background p-2.5 text-sm text-muted-foreground">
            No contraindications listed.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-[0.9375rem] font-semibold text-sodium">Warnings</h3>
        {prescription.warnings && prescription.warnings.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="border border-line bg-background p-2.5 text-sm text-muted-foreground">
            No warnings listed.
          </p>
        )}
      </div>
    </div>
  );
}
