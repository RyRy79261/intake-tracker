"use client";

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { Button } from "@intake/ui/button";
import { RecordRow } from "@/components/history/record-row";
import { useSettings } from "@/hooks/use-settings";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditBloodPressureDialog, validateBloodPressureEdit } from "@/components/edit-blood-pressure-dialog";
import { EditEatingDialog } from "@/components/edit-eating-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { EditDefecationDialog } from "@/components/edit-defecation-dialog";
import { EditSubstanceDialog } from "@/components/edit-substance-dialog";
import {
  Calendar,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import {
  type IntakeRecord,
  type WeightRecord,
  type BloodPressureRecord,
  type EatingRecord,
  type UrinationRecord,
  type DefecationRecord,
  type SubstanceRecord,
} from "@/lib/db";
import {
  type FilterType,
  type UnifiedRecord,
  getRecordId,
  groupRecordsByDate,
  filterRecords,
} from "@/lib/history-types";
import { CARD_THEMES } from "@/lib/card-themes";
import { useRecordsTabData } from "@/hooks/use-records-tab-queries";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useUpdateWeight, useUpdateBloodPressure, useDeleteWeight, useDeleteBloodPressure } from "@/hooks/use-health-queries";
import { resolveEditedTimestamp } from "@/hooks/use-edit-record";
import { parseWeightForm, normalizeAmountEstimate } from "@intake/core/record-schemas";
import { useUpdateEating, useDeleteEating } from "@/hooks/use-eating-queries";
import { useUpdateUrination, useDeleteUrination } from "@/hooks/use-urination-queries";
import { useUpdateDefecation, useDeleteDefecation } from "@/hooks/use-defecation-queries";
import { useUpdateSubstance } from "@/hooks/use-substance-queries";
import {
  useDeleteLiquidEntry,
  useDeleteSubstanceWithUndo,
  describeSubstanceDeleteCascade,
} from "@/hooks/use-composable-entry";
import { useToast } from "@intake/ui/use-toast";
import { useKeyboardAwareScroll } from "@/hooks/use-keyboard-scroll";
import { domainColor } from "@/lib/domain-colors";
import { getDeviceTimezone } from "@/lib/timezone";
import { timestampToDateTimeLocal } from "@/lib/date-utils";
import type { TimeRange } from "@intake/types/analytics";
import { standardDrinksFromAbv, abvFromStandardDrinks } from "@intake/core/alcohol";

const PAGE_SIZE = 50;

// Record types whose delete mutation surfaces its own undo toast
// (useUndoDeleteMutation). For these we must NOT fire a second "Entry deleted"
// toast on delete — TOAST_LIMIT is 1, so it would clobber the Undo action.
const UNDO_TOAST_TYPES = new Set<string>([
  "intake",
  "eating",
  "urination",
  "defecation",
  "caffeine",
  "alcohol",
  "weight",
  "bp",
]);

function entriesLabel(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

interface RecordsTabProps {
  range: TimeRange;
  /**
   * The domain filter, when the parent keeps it (the Metrics window, so
   * Home's Today rows can open Records filtered). Left out, the tab keeps
   * its own, starting at "All".
   */
  filter?: FilterType | undefined;
  onFilterChange?: ((filter: FilterType) => void) | undefined;
}

// Optional-tracker filter tabs are gated on user settings — see
// `visibleFilterTabs` inside RecordsTab.
const FILTER_TABS: {
  value: FilterType;
  label: string;
  optional?: "sugar" | "potassium";
}[] = [
  { value: "all", label: "All" },
  { value: "water", label: "Water" },
  { value: "salt", label: "Sodium" },
  { value: "sugar", label: "Sugar", optional: "sugar" },
  { value: "potassium", label: "K", optional: "potassium" },
  { value: "weight", label: "Weight" },
  { value: "bp", label: "BP" },
  { value: "eating", label: "Eating" },
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "caffeine", label: "Caffeine" },
  { value: "alcohol", label: "Alcohol" },
];

/** A filter chip's colour: its domain, ink for All and potassium. */
function filterColor(filter: FilterType): string {
  if (filter === "all" || filter === "potassium") return "hsl(var(--fg))";
  return domainColor(CARD_THEMES[filter].domain);
}

export function RecordsTab({ range, filter: filterProp, onFilterChange }: RecordsTabProps) {
  const { toast } = useToast();
  const { onFocus: scrollOnFocus } = useKeyboardAwareScroll();
  const settings = useSettings();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const visibleFilterTabs = FILTER_TABS.filter(
    (t) =>
      !t.optional ||
      (t.optional === "sugar" && sugarEnabled) ||
      (t.optional === "potassium" && potassiumEnabled),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ownFilter, setOwnFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  // A filter for a tracker that is switched off falls back to All.
  const requested = filterProp ?? ownFilter;
  const filter: FilterType = visibleFilterTabs.some((t) => t.value === requested)
    ? requested
    : "all";
  const setFilter = (next: FilterType) => {
    if (onFilterChange) onFilterChange(next);
    else setOwnFilter(next);
  };

  // Reset page when range or filter changes (the filter can change from
  // outside, e.g. a Today row opening Records filtered).
  useEffect(() => {
    setPage(1);
  }, [range.start, range.end, filter]);

  // Fetch all domain records via hook
  const { data: allRecords } = useRecordsTabData(range);

  // Mutations
  const updateMutation = useUpdateIntake();
  const deleteIntakeMutation = useDeleteIntake();
  // Same blast radius as the Liquids card: a drink's water row takes the
  // whole drink (substances, sugar, salt) with it; a meal's water row doesn't.
  const deleteMutation = useDeleteLiquidEntry(deleteIntakeMutation.mutateAsync);
  const deleteSubstance = useDeleteSubstanceWithUndo();
  const updateWeightMutation = useUpdateWeight();
  const deleteWeightMutation = useDeleteWeight();
  const updateBPMutation = useUpdateBloodPressure();
  const deleteBPMutation = useDeleteBloodPressure();
  const updateEatingMutation = useUpdateEating();
  const deleteEatingMutation = useDeleteEating();
  const updateUrinationMutation = useUpdateUrination();
  const deleteUrinationMutation = useDeleteUrination();
  const updateDefecationMutation = useUpdateDefecation();
  const deleteDefecationMutation = useDeleteDefecation();
  const updateSubstanceMutation = useUpdateSubstance();

  // Edit dialog states
  const [editingIntake, setEditingIntake] = useState<IntakeRecord | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightRecord | null>(null);
  const [editingBP, setEditingBP] = useState<BloodPressureRecord | null>(null);
  const [editingEating, setEditingEating] = useState<EatingRecord | null>(null);
  const [editingUrination, setEditingUrination] = useState<UrinationRecord | null>(null);
  const [editingDefecation, setEditingDefecation] = useState<DefecationRecord | null>(null);
  const [editingSubstance, setEditingSubstance] = useState<SubstanceRecord | null>(null);

  // Edit form states
  const [editAmount, setEditAmount] = useState("");
  const [editTimestamp, setEditTimestamp] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSystolic, setEditSystolic] = useState("");
  const [editDiastolic, setEditDiastolic] = useState("");
  const [editHeartRate, setEditHeartRate] = useState("");
  const [editPosition, setEditPosition] = useState<"sitting" | "standing">("sitting");
  const [editArm, setEditArm] = useState<"left" | "right">("left");
  const [editIrregularHeartbeat, setEditIrregularHeartbeat] = useState(false);
  const [editAmountUrination, setEditAmountUrination] = useState("");
  const [editAmountDefecation, setEditAmountDefecation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubstanceAmount, setEditSubstanceAmount] = useState("");
  const [editSubstanceVolume, setEditSubstanceVolume] = useState("");

  // Filter + paginate
  const filteredRecords = useMemo(() => filterRecords(allRecords, filter), [allRecords, filter]);
  const visibleEnd = page * PAGE_SIZE;
  const visibleRecords = filteredRecords.slice(0, visibleEnd);
  const hasMore = visibleEnd < filteredRecords.length;

  // Day groups follow the dashboard's logical day. The header counts come
  // from the whole filtered list so a day split across pages isn't undercounted.
  // Memoised: the full list can be thousands of rows under "All", and the edit
  // dialogs re-render this component on every keystroke.
  const dayStartHour = settings.dayStartHour;
  const tz = getDeviceTimezone();
  const groupedRecords = groupRecordsByDate(visibleRecords, { dayStartHour, tz });
  const dateGroups = Array.from(groupedRecords.entries());
  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    groupRecordsByDate(filteredRecords, { dayStartHour, tz }).forEach((recs, date) =>
      counts.set(date, recs.length),
    );
    return counts;
  }, [filteredRecords, dayStartHour, tz]);

  // Delete handler
  const handleDelete = useCallback(async (unified: UnifiedRecord) => {
    const id = getRecordId(unified);
    setDeletingId(id);
    try {
      if (unified.type === "intake") await deleteMutation.mutateAsync(id);
      else if (unified.type === "weight") await deleteWeightMutation.mutateAsync(id);
      else if (unified.type === "bp") await deleteBPMutation.mutateAsync(id);
      else if (unified.type === "eating") await deleteEatingMutation.mutateAsync(id);
      else if (unified.type === "urination") await deleteUrinationMutation.mutateAsync(id);
      else if (unified.type === "defecation") await deleteDefecationMutation.mutateAsync(id);
      else if (unified.type === "caffeine" || unified.type === "alcohol") {
        // A drink's substance takes the whole drink with it; say so first.
        const cascade = await describeSubstanceDeleteCascade(id);
        if (cascade && !window.confirm(`Delete this whole drink? This also removes ${cascade}.`)) return;
        await deleteSubstance(id);
      }
      if (!UNDO_TOAST_TYPES.has(unified.type)) {
        toast({ title: "Entry deleted", description: "Record removed" });
      }
    } catch {
      toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [toast, deleteMutation, deleteWeightMutation, deleteBPMutation, deleteEatingMutation, deleteUrinationMutation, deleteDefecationMutation, deleteSubstance]);

  // Edit openers
  const openEdit = useCallback((unified: UnifiedRecord) => {
    setEditTimestamp(timestampToDateTimeLocal(unified.record.timestamp));
    setEditNote((unified.record as unknown as { note?: string }).note || "");

    if (unified.type === "intake") {
      setEditingIntake(unified.record);
      setEditAmount(unified.record.amount.toString());
    } else if (unified.type === "weight") {
      setEditingWeight(unified.record);
      setEditWeight(unified.record.weight.toString());
    } else if (unified.type === "bp") {
      setEditingBP(unified.record);
      setEditSystolic(unified.record.systolic.toString());
      setEditDiastolic(unified.record.diastolic.toString());
      setEditHeartRate(unified.record.heartRate?.toString() || "");
      setEditPosition(unified.record.position);
      setEditArm(unified.record.arm);
      setEditIrregularHeartbeat(unified.record.irregularHeartbeat === true);
    } else if (unified.type === "eating") {
      setEditingEating(unified.record);
    } else if (unified.type === "urination") {
      setEditingUrination(unified.record);
      setEditAmountUrination(unified.record.amountEstimate || "");
    } else if (unified.type === "defecation") {
      setEditingDefecation(unified.record);
      setEditAmountDefecation(unified.record.amountEstimate || "");
    } else if (unified.type === "caffeine" || unified.type === "alcohol") {
      setEditingSubstance(unified.record);
      setEditDescription(unified.record.description);
      if (unified.type === "caffeine") {
        setEditSubstanceAmount(unified.record.amountMg?.toString() ?? "");
        setEditSubstanceVolume("");
      } else {
        const rec = unified.record;
        // Prefer the stored ABV %; derive it from a legacy std-drinks value
        // when the record predates abvPercent (needs a known volume).
        const abv =
          rec.abvPercent ??
          (rec.amountStandardDrinks !== undefined && rec.volumeMl
            ? abvFromStandardDrinks(rec.amountStandardDrinks, rec.volumeMl)
            : undefined);
        setEditSubstanceAmount(
          abv !== undefined ? parseFloat(abv.toFixed(1)).toString() : "",
        );
        setEditSubstanceVolume(rec.volumeMl?.toString() ?? "");
      }
    }
  }, []);

  // Edit submit handlers
  const handleEditIntakeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIntake) return;
    // Number, not parseInt: parseInt read "1e3" as 1. Amounts are whole units.
    const newAmount = editAmount.trim() === "" ? NaN : Number(editAmount.trim());
    const ts = resolveEditedTimestamp(editingIntake.timestamp, editTimestamp);
    const newNote = editNote.trim() || undefined;
    if (!Number.isInteger(newAmount) || newAmount <= 0) { toast({ title: "Invalid amount", description: "Enter a whole number above 0.", variant: "destructive" }); return; }
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      await updateMutation.mutateAsync({ id: editingIntake.id, updates: { amount: newAmount, timestamp: ts.timestamp, ...(newNote !== undefined && { note: newNote }) } });
      setEditingIntake(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingIntake, editAmount, editTimestamp, editNote, toast, updateMutation]);

  // Weight / BP / urination / defecation edits share the dashboard cards'
  // validation (@intake/core/record-schemas), keep the original timestamp
  // when the minute is unchanged, reject future times, and send `null` to
  // clear an optional field (an omitted key would keep the old value).
  const handleEditWeightSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeight) return;
    const weight = parseWeightForm({ weight: editWeight });
    const ts = resolveEditedTimestamp(editingWeight.timestamp, editTimestamp);
    if (!weight.ok) { toast({ title: "Invalid weight", description: weight.message, variant: "destructive" }); return; }
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      await updateWeightMutation.mutateAsync({ id: editingWeight.id, updates: { weight: weight.data.weight, timestamp: ts.timestamp, note: editNote.trim() || null } });
      setEditingWeight(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingWeight, editWeight, editTimestamp, editNote, toast, updateWeightMutation]);

  const handleEditBPSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBP) return;
    const bp = validateBloodPressureEdit(
      { systolic: editSystolic, diastolic: editDiastolic, heartRate: editHeartRate },
      () => { setEditSystolic(editDiastolic); setEditDiastolic(editSystolic); },
    );
    if (!bp) return;
    const ts = resolveEditedTimestamp(editingBP.timestamp, editTimestamp);
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      await updateBPMutation.mutateAsync({ id: editingBP.id, updates: { systolic: bp.systolic, diastolic: bp.diastolic, heartRate: bp.heartRate, irregularHeartbeat: editIrregularHeartbeat, position: editPosition, arm: editArm, timestamp: ts.timestamp, note: editNote.trim() || null } });
      setEditingBP(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingBP, editSystolic, editDiastolic, editHeartRate, editIrregularHeartbeat, editPosition, editArm, editTimestamp, editNote, toast, updateBPMutation]);

  const handleEditEatingSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEating) return;
    const ts = resolveEditedTimestamp(editingEating.timestamp, editTimestamp);
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      // Pass the note explicitly so clearing the field clears it.
      const eatingNote = editNote.trim() || undefined;
      await updateEatingMutation.mutateAsync({ id: editingEating.id, updates: { timestamp: ts.timestamp, note: eatingNote } });
      setEditingEating(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingEating, editTimestamp, editNote, toast, updateEatingMutation]);

  const handleEditUrinationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUrination) return;
    const ts = resolveEditedTimestamp(editingUrination.timestamp, editTimestamp);
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      // `null` clears; the update types predate explicit clears.
      const updates = { timestamp: ts.timestamp, amountEstimate: normalizeAmountEstimate(editAmountUrination), note: editNote.trim() || null };
      await updateUrinationMutation.mutateAsync({ id: editingUrination.id, updates: updates as { timestamp: number; amountEstimate?: string; note?: string } });
      setEditingUrination(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingUrination, editTimestamp, editAmountUrination, editNote, toast, updateUrinationMutation]);

  const handleEditDefecationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDefecation) return;
    const ts = resolveEditedTimestamp(editingDefecation.timestamp, editTimestamp);
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    try {
      const updates = { timestamp: ts.timestamp, amountEstimate: normalizeAmountEstimate(editAmountDefecation), note: editNote.trim() || null };
      await updateDefecationMutation.mutateAsync({ id: editingDefecation.id, updates: updates as { timestamp: number; amountEstimate?: string; note?: string } });
      setEditingDefecation(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingDefecation, editTimestamp, editAmountDefecation, editNote, toast, updateDefecationMutation]);

  const handleEditSubstanceSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubstance) return;
    const ts = resolveEditedTimestamp(editingSubstance.timestamp, editTimestamp);
    if (!ts.ok) { toast({ title: ts.message, variant: "destructive" }); return; }
    const newTimestamp = ts.timestamp;
    const desc = editDescription.trim();
    if (!desc) { toast({ title: "Description required", variant: "destructive" }); return; }
    const hasAmount = editSubstanceAmount.trim() !== "";
    const amt = parseFloat(editSubstanceAmount);
    if (hasAmount && (isNaN(amt) || amt < 0)) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    const vol = parseFloat(editSubstanceVolume);
    const hasVolume = editSubstanceVolume.trim() !== "" && !isNaN(vol) && vol > 0;
    // Alcohol amount is ABV %; standard drinks are derived from ABV % + volume,
    // so both must be valid before persisting an alcohol amount change.
    if (hasAmount && editingSubstance.type === "alcohol") {
      if (amt <= 0 || amt > 100) {
        toast({ title: "ABV must be between 0 and 100", variant: "destructive" });
        return;
      }
      if (!hasVolume) {
        toast({ title: "Enter a volume greater than 0", variant: "destructive" });
        return;
      }
    }
    try {
      let amountField: Partial<SubstanceRecord> = {};
      if (hasAmount) {
        if (editingSubstance.type === "caffeine") {
          amountField = { amountMg: amt };
        } else {
          // `amt` is ABV %; volume is validated as positive above.
          amountField = {
            abvPercent: amt,
            volumeMl: vol,
            amountStandardDrinks: parseFloat(
              standardDrinksFromAbv(amt, vol).toFixed(2),
            ),
          };
        }
      }
      await updateSubstanceMutation(editingSubstance.id, {
        timestamp: newTimestamp,
        description: desc,
        ...amountField,
      });
      setEditingSubstance(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingSubstance, editTimestamp, editDescription, editSubstanceAmount, editSubstanceVolume, toast, updateSubstanceMutation]);

  return (
    <>
      {/* Domain filter */}
      <div className="wm-chips" role="group" aria-label="Filter records">
        {visibleFilterTabs.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            data-filter={f.value}
            style={{ "--c": filterColor(f.value) } as CSSProperties}
            onClick={() => { setFilter(f.value); setPage(1); }}
          >
            {f.value !== "all" && <span className="mark" aria-hidden="true" />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Records list */}
      {filteredRecords.length === 0 ? (
        <div className="wm-empty rec">
          <ClipboardList aria-hidden="true" />
          <p>No records in this time range</p>
        </div>
      ) : (
        <>
          {dateGroups.map(([date, dayRecords]) => (
            <div key={date} className="min-w-0">
              <h3 className="wm-day">
                <Calendar aria-hidden="true" />
                <span>{date}</span>
                <span className="wm-cnt">
                  {entriesLabel(dayCounts.get(date) ?? dayRecords.length)}
                </span>
              </h3>
              <div className="wm-list">
                {dayRecords.map((unified) => (
                  <RecordRow
                    key={unified.record.id}
                    unified={unified}
                    onDelete={() => handleDelete(unified)}
                    onEdit={() => openEdit(unified)}
                    isDeleting={deletingId === unified.record.id}
                    liquidPresets={settings.liquidPresets}
                  />
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              className="wm-full mt-0"
            >
              <ChevronDown />
              Load More
            </Button>
          )}
        </>
      )}

      {/* Edit dialogs */}
      <EditIntakeDialog
        record={editingIntake}
        onClose={() => setEditingIntake(null)}
        onSubmit={handleEditIntakeSubmit}
        amount={editAmount}
        onAmountChange={setEditAmount}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditWeightDialog
        record={editingWeight}
        onClose={() => setEditingWeight(null)}
        onSubmit={handleEditWeightSubmit}
        weight={editWeight}
        onWeightChange={setEditWeight}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditBloodPressureDialog
        record={editingBP}
        onClose={() => setEditingBP(null)}
        onSubmit={handleEditBPSubmit}
        systolic={editSystolic}
        onSystolicChange={setEditSystolic}
        diastolic={editDiastolic}
        onDiastolicChange={setEditDiastolic}
        heartRate={editHeartRate}
        onHeartRateChange={setEditHeartRate}
        position={editPosition}
        onPositionChange={setEditPosition}
        arm={editArm}
        onArmChange={setEditArm}
        irregularHeartbeat={editIrregularHeartbeat}
        onIrregularHeartbeatChange={setEditIrregularHeartbeat}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditEatingDialog
        record={editingEating}
        onClose={() => setEditingEating(null)}
        onSubmit={handleEditEatingSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditUrinationDialog
        record={editingUrination}
        onClose={() => setEditingUrination(null)}
        onSubmit={handleEditUrinationSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        amount={editAmountUrination}
        onAmountChange={setEditAmountUrination}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditDefecationDialog
        record={editingDefecation}
        onClose={() => setEditingDefecation(null)}
        onSubmit={handleEditDefecationSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        amount={editAmountDefecation}
        onAmountChange={setEditAmountDefecation}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditSubstanceDialog
        record={editingSubstance}
        onClose={() => setEditingSubstance(null)}
        onSubmit={handleEditSubstanceSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        description={editDescription}
        onDescriptionChange={setEditDescription}
        amount={editSubstanceAmount}
        onAmountChange={setEditSubstanceAmount}
        volume={editSubstanceVolume}
        onVolumeChange={setEditSubstanceVolume}
        onFocus={scrollOnFocus}
      />
    </>
  );
}
