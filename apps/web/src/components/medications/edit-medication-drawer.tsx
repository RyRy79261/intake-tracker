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
import { Loader2, Plus, Clock, Edit2, Check, X, Trash2, TrendingUp } from "lucide-react";
import { useMedicineSearch } from "@/hooks/use-medicine-search";
import { STRENGTH_UNITS, convertStrength, normalizeStrengthUnit, parseStrength } from "@intake/core/strength";
import { compoundSum, formatCompoundShort, isCombo } from "@intake/core/compound";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { findActiveBrand, unitsMatch } from "@/lib/dose-preview";
import { DoseAmountInput, DosePreviewLine } from "@/components/medications/dose-amount-field";
import { PillIcon } from "@/components/medications/pill-icon";
import { PILL_SHAPES, PRESET_COLORS } from "@/components/medications/add-medication-steps/types";
import { cn } from "@/lib/utils";
import { WEEK_DAY_ORDER } from "@/lib/date-utils";

const SELECT_CLASS =
  "flex h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-xs";

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
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{currentPrescription.genericName}</DrawerTitle>
          <p className="text-sm text-muted-foreground">
            {currentPrescription.indication || "Prescription"}
          </p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="schedule" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="schedule" className="py-2 text-xs">Schedule</TabsTrigger>
                <TabsTrigger value="medicine" className="py-2 text-xs">Medicine</TabsTrigger>
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="info" className="py-2 text-xs">Info</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="schedule" className="mt-0">
                <ScheduleTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="medicine" className="mt-0">
                <MedicineTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="details" className="mt-0 space-y-6">
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
    <div className="space-y-5 pb-4">
      {activeTitration && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            An active titration is currently in effect — today&apos;s doses follow
            the titration plan. Changes here update your baseline (maintenance)
            schedule, which resumes when the titration ends.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Edit the day-to-day schedule for minor tweaks. For a planned dose
        increase or decrease, create a plan in the Titrations tab instead.
      </p>

      {/* Unit */}
      <div className="space-y-1.5">
        <Label htmlFor={unitSelectId} className="text-xs">Dosage unit</Label>
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
          <p role="alert" className="text-xs text-destructive">
            {activeBrand.brandName} is counted in {activeBrand.unit} — doses must be in{" "}
            {activeBrand.unit} too.
          </p>
        )}
      </div>

      {/* Food instruction */}
      <div className="space-y-1.5">
        <Label className="text-xs">Food instruction</Label>
        <div className="flex gap-1">
          {(["none", "before", "after"] as FoodInstruction[]).map((fi) => (
            <Button
              key={fi}
              type="button"
              variant={foodInstruction === fi ? "default" : "outline"}
              size="sm"
              className="text-xs h-8 flex-1 capitalize"
              onClick={() => { setFoodInstruction(fi); setDirty(true); }}
            >
              {fi === "none" ? "Anytime" : `${fi} eating`}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule rows */}
      <div className="space-y-2">
        <Label className="text-xs">Daily doses</Label>
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
            No doses scheduled. Add a time below.
          </p>
        )}
        {rows.map((row, idx) => (
          <div key={row.id ?? `new-${idx}`} className="border rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={row.time}
                onChange={(e) => updateRow(idx, { time: e.target.value })}
                className="h-8 text-sm flex-1"
              />
              <DoseAmountInput
                dosage={row.dosage}
                onDosageChange={(dosage) => updateRow(idx, { dosage })}
                unit={unit}
                brand={activeBrand}
                className="h-8 text-sm w-20"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remove dose"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <DosePreviewLine dosage={row.dosage} unit={unit} brand={activeBrand} />
            <div className="flex gap-1">
              {WEEK_DAY_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(idx, day)}
                  className={`text-[10px] flex-1 h-6 rounded-md border transition-colors ${
                    row.daysOfWeek.includes(day)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-input hover:bg-muted"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-8 w-full"
          onClick={addRow}
        >
          <Plus className="w-3 h-3 mr-1" /> Add time
        </Button>
      </div>

      {dirty && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-xs"
            onClick={handleReset}
            disabled={isSaving}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="flex-1 h-9 text-xs bg-teal-600 hover:bg-teal-700"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save schedule"}
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
      <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
        No medicine stocked for this prescription.
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {items.map((item) =>
        editingId === item.id ? (
          <MedicineEditForm
            key={item.id}
            item={item}
            phaseUnit={phaseUnit}
            onDone={() => setEditingId(null)}
          />
        ) : (
          <div key={item.id} className="flex items-center gap-3 border rounded-lg p-3">
            <PillIcon shape={item.pillShape} color={item.pillColor} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {item.brandName} {strengthLabel(item)}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.isActive ? "In use · " : ""}
                {round4(item.currentStock ?? 0)} on hand
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1"
              aria-label={`Edit ${item.brandName}`}
              onClick={() => setEditingId(item.id)}
            >
              <Edit2 className="w-3 h-3" /> Edit
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
      <div className="border rounded-lg p-3 space-y-3">
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
          <Button size="sm" variant="ghost" disabled={isSaving} onClick={() => setAskStock(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-brand`} className="text-xs">Brand name</Label>
        <Input id={`${ids}-brand`} value={brandName} onChange={(e) => setBrandName(e.target.value)} className="h-9" />
      </div>

      <div className="flex items-end gap-2">
        {combo ? (
          (item.compounds ?? []).map((c, i) => (
            <div key={i} className="space-y-1.5 flex-1">
              <Label htmlFor={`${ids}-compound-${i}`} className="text-xs">{c.name || "Compound"}</Label>
              <Input
                id={`${ids}-compound-${i}`}
                inputMode="decimal"
                value={compoundText[i] ?? ""}
                onChange={(e) =>
                  setCompoundText((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))
                }
                className="h-9"
              />
            </div>
          ))
        ) : (
          <div className="space-y-1.5 flex-1">
            <Label htmlFor={`${ids}-strength`} className="text-xs">Strength</Label>
            <Input
              id={`${ids}-strength`}
              inputMode="decimal"
              value={strengthText}
              onChange={(e) => setStrengthText(e.target.value)}
              className="h-9"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-unit`} className="text-xs">Unit</Label>
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
        <p className="text-xs text-muted-foreground">
          1 pill = {strength} {unit}
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Pill look</Label>
        <div className="flex gap-1 flex-wrap">
          {PILL_SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-label={s.label}
              aria-pressed={pillShape === s.value}
              onClick={() => setPillShape(s.value)}
              className={cn(
                "p-1.5 rounded-md border",
                pillShape === s.value ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40" : "border-border",
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
                "w-6 h-6 rounded-full border-2",
                pillColor === c ? "border-teal-500" : "border-transparent",
                c === "#FFFFFF" && pillColor !== c && "border-gray-300",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor={`${ids}-days`} className="text-xs">Alert when days left</Label>
          <Input
            id={`${ids}-days`}
            type="number"
            min="0"
            value={refillDays}
            onChange={(e) => setRefillDays(e.target.value)}
            placeholder="None"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor={`${ids}-pills`} className="text-xs">Alert when pills left</Label>
          <Input
            id={`${ids}-pills`}
            type="number"
            min="0"
            value={refillPills}
            onChange={(e) => setRefillPills(e.target.value)}
            placeholder="None"
            className="h-9"
          />
        </div>
      </div>

      {errors.map((e) => (
        <p key={e} role="alert" className="text-xs text-destructive">{e}</p>
      ))}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1 h-9 text-xs bg-teal-600 hover:bg-teal-700"
          onClick={() => save()}
          disabled={errors.length > 0 || isSaving}
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save medicine"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Details Tab — name, indication, notes, active toggle, delete.
// ============================================================================

function DetailsTab({ prescription, onOpenChange }: { prescription: Prescription, onOpenChange: (open: boolean) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(prescription.genericName);
  const [indication, setIndication] = useState(prescription.indication ?? "");
  const [notes, setNotes] = useState(prescription.notes || "");
  const [isActive, setIsActive] = useState(prescription.isActive);

  const updatePrescription = useUpdatePrescription();
  const deletePrescription = useDeletePrescription();

  useEffect(() => {
    setName(prescription.genericName);
    setIndication(prescription.indication ?? "");
    setNotes(prescription.notes || "");
    setIsActive(prescription.isActive);
    setIsEditing(false);
  }, [prescription]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Prescription Details</h3>
        {!isEditing ? (
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setIsEditing(true)}>
            <Edit2 className="w-3 h-3" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-teal-600" onClick={handleSave} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Active Prescription</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason for use</Label>
            <Input value={indication} onChange={(e) => setIndication(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Active Prescription</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={handleToggleActive} />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason for use</p>
            <p className="text-sm font-medium">{prescription.indication || "None specified"}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm bg-muted/30 p-3 rounded-lg border">
              {prescription.notes || "No notes added."}
            </p>
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDelete}
              disabled={deletePrescription.isPending}
            >
              {deletePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Prescription"}
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
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Edit AI Information</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-red-500 dark:text-red-400">Contraindications (one per line)</Label>
              <Textarea
                value={editContraindications}
                onChange={(e) => setEditContraindications(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-amber-500 dark:text-amber-400">Warnings (one per line)</Label>
              <Textarea
                value={editWarnings}
                onChange={(e) => setEditWarnings(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button size="sm" variant="ghost" onClick={() => setIsEditingAiData(false)}>Cancel</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={saveEdits} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Review AI Information</h3>
        </div>

        <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-50/30 dark:bg-teal-950/10 space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-xs text-red-500 dark:text-red-400">New Contraindications</h4>
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
            <h4 className="font-semibold text-xs text-amber-500 dark:text-amber-400">New Warnings</h4>
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

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button size="sm" variant="ghost" onClick={handleReject}>Reject</Button>
            <Button size="sm" variant="outline" onClick={startEditing}>Edit</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleAccept} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Information</h3>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={handleRefresh} disabled={isRefreshing || updatePrescription.isPending}>
          {isRefreshing || updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          Refresh AI Data
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-red-500 dark:text-red-400">Contraindications</h3>
        {prescription.contraindications && prescription.contraindications.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.contraindications.map((c, i) => (
              <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No contraindications listed.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-amber-500 dark:text-amber-400">Warnings</h3>
        {prescription.warnings && prescription.warnings.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No warnings listed.
          </p>
        )}
      </div>
    </div>
  );
}
