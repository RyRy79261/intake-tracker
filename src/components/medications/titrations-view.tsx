"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Loader2 } from "lucide-react";
import {
  usePrescriptions,
  useTitrationPlans,
  usePhasesForTitrationPlan,
  usePhasesForPrescription,
  useSchedulesForPhase,
  useCreateTitrationPlan,
  useUpdateTitrationPlan,
  useActivateTitrationPlan,
  useCompleteTitrationPlan,
  useCancelTitrationPlan,
  useDeleteTitrationPlan,
} from "@/hooks/use-medication-queries";
import type { TitrationPlan, MedicationPhase, Prescription } from "@/lib/db";
import { useAuth } from "@/components/auth-guard";
import { isOffline } from "@/lib/ai-client";
import {
  Plus,
  Play,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  XCircle,
  ChevronDown,
  X,
  Pencil,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TitrationsView() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TitrationPlan | null>(null);
  const prescriptions = usePrescriptions();
  const plans = useTitrationPlans();

  const activePlans = plans.filter((p) => p.status === "active");
  const draftPlans = plans.filter((p) => p.status === "draft");
  const pastPlans = plans.filter(
    (p) => p.status === "completed" || p.status === "cancelled",
  );

  const activePrescriptions = prescriptions.filter((p) => p.isActive);

  return (
    <div className="space-y-4 pb-24 px-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Manage dosage adjustments across prescriptions.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => { setEditingPlan(null); setDrawerOpen(true); }}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            No titration plans yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Create a plan to adjust dosages across prescriptions.
          </p>
        </div>
      ) : (
        <>
          {activePlans.length > 0 && (
            <Section label="Active">
              {activePlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => { setEditingPlan(plan); setDrawerOpen(true); }} />
              ))}
            </Section>
          )}

          {draftPlans.length > 0 && (
            <Section label="Planned">
              {draftPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => { setEditingPlan(plan); setDrawerOpen(true); }} />
              ))}
            </Section>
          )}

          {pastPlans.length > 0 && (
            <Section label="Past">
              {pastPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => { setEditingPlan(plan); setDrawerOpen(true); }} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* Current maintenance overview — at bottom */}
      {activePrescriptions.length > 0 && (
        <Section label="Current Maintenance">
          <div className="space-y-2">
            {activePrescriptions
              .sort((a, b) => a.genericName.localeCompare(b.genericName))
              .map((rx) => (
                <MaintenanceRow key={rx.id} prescription={rx} />
              ))}
          </div>
        </Section>
      )}

      <TitrationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prescriptions={activePrescriptions}
        editingPlan={editingPlan}
      />
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maintenance row (shows current maintenance schedule for a prescription)
// ---------------------------------------------------------------------------

function MaintenanceRow({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const maintenancePhase = phases.find(
    (p) => p.type === "maintenance" && p.status === "active",
  );
  const schedules = useSchedulesForPhase(maintenancePhase?.id);

  if (!maintenancePhase || schedules.length === 0) return null;

  const totalDaily = schedules.reduce((acc, s) => acc + s.dosage, 0);

  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{prescription.genericName}</span>
        <span className="text-[10px] text-muted-foreground">
          {totalDaily}{maintenancePhase.unit}/day
        </span>
      </div>
      {prescription.indication && (
        <span className="text-[10px] text-muted-foreground">{prescription.indication}</span>
      )}
      <div className="mt-1.5 space-y-0.5">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{s.time}</span>
            <span className="font-medium text-foreground">
              {s.dosage}{maintenancePhase.unit}
            </span>
            {s.daysOfWeek.length < 7 && (
              <span className="text-[10px]">
                ({s.daysOfWeek.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function TitrationPlanCard({ plan, onEdit }: { plan: TitrationPlan; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const phases = usePhasesForTitrationPlan(plan.id);

  const activateMutation = useActivateTitrationPlan();
  const completeMutation = useCompleteTitrationPlan();
  const cancelMutation = useCancelTitrationPlan();
  const deleteMutation = useDeleteTitrationPlan();

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500 text-white",
    draft: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    completed:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    cancelled:
      "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  const startDateLabel = plan.recommendedStartDate
    ? new Date(plan.recommendedStartDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const isActive = plan.status === "active";

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer hover:bg-muted/40 transition-colors",
        isActive && "border-emerald-400 dark:border-emerald-600 border-2",
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold truncate">{plan.title}</h4>
            <Badge
              className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor[plan.status]}`}
            >
              {plan.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">
              {plan.conditionLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {phases.length} prescription{phases.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {startDateLabel && (
            <span className="text-[10px] text-muted-foreground">
              {startDateLabel}
            </span>
          )}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>
      </div>

      {/* Warnings — show when collapsed only if active */}
      {plan.warnings && plan.warnings.length > 0 && (isActive || expanded) && (
        <div className="mt-2 space-y-1">
          {plan.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 mt-2 border-t space-y-2">
              {phases.map((phase) => (
                <PhaseEntryRow key={phase.id} phase={phase} />
              ))}

              {plan.notes && (
                <p className="text-[11px] text-muted-foreground italic pt-1">
                  {plan.notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {(plan.status === "draft" || plan.status === "active") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={onEdit}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>
                )}
                {plan.status === "draft" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs gap-1 bg-teal-600 hover:bg-teal-700"
                    onClick={() => activateMutation.mutate(plan.id)}
                    disabled={activateMutation.isPending}
                  >
                    <Play className="w-3 h-3" />
                    Activate
                  </Button>
                )}
                {plan.status === "active" && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => completeMutation.mutate(plan.id)}
                      disabled={completeMutation.isPending}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Complete &amp; Promote
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-red-500 hover:text-red-600"
                      onClick={() => cancelMutation.mutate(plan.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="w-3 h-3" />
                      Cancel
                    </Button>
                  </>
                )}
                {(plan.status === "draft" || plan.status === "cancelled") && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-red-500 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete titration plan?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &ldquo;{plan.title}&rdquo; and its associated phases.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => deleteMutation.mutate(plan.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase entry row (inside expanded plan card)
// ---------------------------------------------------------------------------

function PhaseEntryRow({ phase }: { phase: MedicationPhase }) {
  const prescriptions = usePrescriptions();
  const schedules = useSchedulesForPhase(phase.id);

  const rx = prescriptions.find((p) => p.id === phase.prescriptionId);

  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{rx?.genericName ?? "Unknown"}</span>
        <Badge
          variant="outline"
          className={`text-[10px] px-1 py-0 ${
            phase.status === "active"
              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500"
              : phase.status === "pending"
                ? "text-blue-600 dark:text-blue-400 border-blue-500"
                : "text-muted-foreground"
          }`}
        >
          {phase.status}
        </Badge>
      </div>
      {schedules.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{s.time}</span>
              <span className="font-medium text-foreground">
                {s.dosage}{phase.unit}
              </span>
              {s.daysOfWeek.length < 7 && (
                <span className="text-[10px]">
                  ({s.daysOfWeek.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create titration drawer
// ---------------------------------------------------------------------------

interface RxEntry {
  prescriptionId: string;
  schedules: { time: string; daysOfWeek: number[]; dosage: string }[];
}

function TitrationDrawer({
  open,
  onOpenChange,
  prescriptions,
  editingPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptions: Prescription[];
  editingPlan: TitrationPlan | null;
}) {
  const createMutation = useCreateTitrationPlan();
  const updateMutation = useUpdateTitrationPlan();
  const { getAuthHeader } = useAuth();
  const isEditing = editingPlan !== null;

  // Load existing phases for editing
  const editingPhases = usePhasesForTitrationPlan(editingPlan?.id);

  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  const [title, setTitle] = useState("");
  const [startNow, setStartNow] = useState(false);
  const [startDate, setStartDate] = useState(todayStr);
  const [notes, setNotes] = useState("");
  const [warnings, setWarnings] = useState("");
  const [entries, setEntries] = useState<RxEntry[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Populate form when editing plan data is available
  // We need useEffect to avoid setting state during render
  const editPlanId = editingPlan?.id ?? null;
  const phasesReady = editingPhases.length > 0;

  // Use a ref-like approach: track which plan we've initialized for
  if (open && isEditing && !initialized && phasesReady) {
    setTitle(editingPlan.title);
    setNotes(editingPlan.notes ?? "");
    setWarnings(editingPlan.warnings?.join("\n") ?? "");
    if (editingPlan.recommendedStartDate) {
      const d = new Date(editingPlan.recommendedStartDate);
      setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setStartNow(false);
    } else {
      setStartNow(editingPlan.status === "active");
    }
    // Entries will be populated by PrefillFromMaintenance or by EditPhaseScheduleLoader below
    setEntries(
      editingPhases.map((phase) => ({
        prescriptionId: phase.prescriptionId,
        schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }],
      })),
    );
    setInitialized(true);
  }

  // Reset when drawer closes
  if (!open && initialized) {
    setInitialized(false);
  }

  const addEntry = () => {
    setEntries([
      ...entries,
      { prescriptionId: "", schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }] },
    ]);
  };

  const removeEntry = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx));
  };

  const updateEntry = (idx: number, update: Partial<RxEntry>) => {
    setEntries(entries.map((e, i) => (i === idx ? { ...e, ...update } : e)));
  };

  // When a prescription is selected, prefill its maintenance schedules
  const selectPrescription = (entryIdx: number, rxId: string) => {
    updateEntry(entryIdx, { prescriptionId: rxId });
  };

  const addScheduleToEntry = (entryIdx: number) => {
    const entry = entries[entryIdx];
    if (!entry) return;
    updateEntry(entryIdx, {
      schedules: [
        ...entry.schedules,
        { time: "12:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" },
      ],
    });
  };

  const removeScheduleFromEntry = (entryIdx: number, schedIdx: number) => {
    const entry = entries[entryIdx];
    if (!entry) return;
    updateEntry(entryIdx, {
      schedules: entry.schedules.filter((_, i) => i !== schedIdx),
    });
  };

  const updateScheduleInEntry = (
    entryIdx: number,
    schedIdx: number,
    update: Partial<RxEntry["schedules"][number]>,
  ) => {
    const entry = entries[entryIdx];
    if (!entry) return;
    updateEntry(entryIdx, {
      schedules: entry.schedules.map((s, i) =>
        i === schedIdx ? { ...s, ...update } : s,
      ),
    });
  };

  const canSubmit =
    title.trim() &&
    entries.length > 0 &&
    entries.every(
      (e) =>
        e.prescriptionId &&
        e.schedules.length > 0 &&
        e.schedules.every((s) => s.dosage && parseFloat(s.dosage) > 0),
    );

  const handleGenerateWarnings = async () => {
    const titrationRxIds = new Set(entries.filter((e) => e.prescriptionId).map((e) => e.prescriptionId));

    // Prescriptions being titrated — include full schedule detail
    const changingRx = entries
      .filter((e) => e.prescriptionId)
      .map((e) => {
        const rx = prescriptions.find((p) => p.id === e.prescriptionId);
        const newSchedule = e.schedules
          .filter((s) => s.dosage)
          .map((s) => {
            const days = s.daysOfWeek.length === 7 ? "daily" : s.daysOfWeek.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
            return `${s.dosage}mg at ${s.time} (${days})`;
          });
        const totalNew = e.schedules.reduce((sum, s) => sum + (parseFloat(s.dosage) || 0), 0);
        return {
          genericName: rx?.genericName ?? "Unknown",
          newSchedule: newSchedule.length > 0 ? newSchedule : undefined,
          newTotalDaily: totalNew > 0 ? `${totalNew}mg/day` : undefined,
          frequency: `${e.schedules.length}x daily`,
        };
      });

    // Other active prescriptions (for interaction context)
    const otherRx = prescriptions
      .filter((p) => !titrationRxIds.has(p.id))
      .map((p) => ({
        genericName: p.genericName,
      }));

    if (changingRx.length === 0) return;
    if (isOffline()) return;

    setAiLoading(true);
    try {
      const authHeaders = await getAuthHeader();
      const res = await fetch("/api/ai/titration-warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          prescriptions: changingRx,
          otherMedications: otherRx.length > 0 ? otherRx : undefined,
          title: title || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.warnings && Array.isArray(data.warnings)) {
          const existing = warnings.trim();
          const newWarnings = data.warnings.join("\n");
          setWarnings(existing ? `${existing}\n${newWarnings}` : newWarnings);
        }
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const warningsList = warnings
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean);

    const firstRx = prescriptions.find(
      (p) => p.id === entries[0]?.prescriptionId,
    );
    const conditionLabel = firstRx?.indication || title.trim();

    const entryData = entries.map((e) => ({
      prescriptionId: e.prescriptionId,
      unit: "mg",
      schedules: e.schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: parseFloat(s.dosage),
      })),
    }));

    const onSuccess = () => {
      setTitle("");
      setNotes("");
      setWarnings("");
      setEntries([]);
      setStartNow(false);
      onOpenChange(false);
    };

    if (isEditing) {
      updateMutation.mutate(
        {
          planId: editingPlan.id,
          title: title.trim(),
          conditionLabel,
          ...(!startNow && {
            recommendedStartDate: new Date(startDate + "T00:00:00").getTime(),
          }),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(warningsList.length > 0 ? { warnings: warningsList } : {}),
          entries: entryData,
        },
        { onSuccess },
      );
    } else {
      createMutation.mutate(
        {
          title: title.trim(),
          conditionLabel,
          startImmediately: startNow,
          ...(!startNow && {
            recommendedStartDate: new Date(startDate + "T00:00:00").getTime(),
          }),
          ...(notes.trim() && { notes: notes.trim() }),
          ...(warningsList.length > 0 && { warnings: warningsList }),
          entries: entryData,
        },
        { onSuccess },
      );
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col outline-none">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{isEditing ? "Edit Titration Plan" : "New Titration Plan"}</DrawerTitle>
        </DrawerHeader>

        {/* Hidden loaders that populate entry schedules from existing titration phases */}
        {isEditing && editingPhases.map((phase, idx) => (
          <EditPhaseScheduleLoader
            key={phase.id}
            phaseId={phase.id}
            entryIdx={idx}
            onLoad={(schedules) => {
              setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, schedules } : e));
            }}
          />
        ))}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm">Title</Label>
            <Input
              placeholder="e.g. Heart failure dose increase"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Start date */}
          <div className="space-y-1.5">
            <Label className="text-sm">Start</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="start-now"
                  checked={startNow}
                  onCheckedChange={setStartNow}
                />
                <Label htmlFor="start-now" className="text-sm cursor-pointer">
                  Start immediately
                </Label>
              </div>
              {!startNow && (
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Prescription entries table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Prescriptions</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addEntry}
              >
                <Plus className="w-3 h-3" />
                Add Rx
              </Button>
            </div>

            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 border rounded-lg border-dashed text-center">
                Add at least one prescription to this plan.
              </p>
            )}

            {entries.map((entry, entryIdx) => (
              <RxEntryCard
                key={entryIdx}
                entry={entry}
                entryIdx={entryIdx}
                prescriptions={prescriptions}
                existingRxIds={entries.map((e) => e.prescriptionId).filter(Boolean)}
                onSelectPrescription={(rxId) => selectPrescription(entryIdx, rxId)}
                onUpdate={(update) => updateEntry(entryIdx, update)}
                onRemove={() => removeEntry(entryIdx)}
                onAddSchedule={() => addScheduleToEntry(entryIdx)}
                onRemoveSchedule={(schedIdx) =>
                  removeScheduleFromEntry(entryIdx, schedIdx)
                }
                onUpdateSchedule={(schedIdx, update) =>
                  updateScheduleInEntry(entryIdx, schedIdx, update)
                }
              />
            ))}
          </div>

          {/* Warnings */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Warning Signs
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleGenerateWarnings}
                disabled={aiLoading || entries.filter((e) => e.prescriptionId).length === 0}
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <TrendingUp className="w-3 h-3" />
                )}
                {aiLoading ? "Generating..." : "AI Suggest"}
              </Button>
            </div>
            <Textarea
              placeholder={"Warning signs will appear here.\nYou can also type your own, one per line."}
              value={warnings}
              onChange={(e) => setWarnings(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              placeholder="Additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="p-4 border-t shrink-0">
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending)
              ? (isEditing ? "Saving..." : "Creating...")
              : isEditing
                ? "Save Changes"
                : startNow
                  ? "Create & Activate"
                  : "Create Plan"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Rx entry card (inside create drawer)
// Prefills titration schedules from current maintenance when Rx is selected.
// ---------------------------------------------------------------------------

function RxEntryCard({
  entry,
  entryIdx,
  prescriptions,
  existingRxIds,
  onSelectPrescription,
  onUpdate,
  onRemove,
  onAddSchedule,
  onRemoveSchedule,
  onUpdateSchedule,
}: {
  entry: RxEntry;
  entryIdx: number;
  prescriptions: Prescription[];
  existingRxIds: string[];
  onSelectPrescription: (rxId: string) => void;
  onUpdate: (update: Partial<RxEntry>) => void;
  onRemove: () => void;
  onAddSchedule: () => void;
  onRemoveSchedule: (schedIdx: number) => void;
  onUpdateSchedule: (
    schedIdx: number,
    update: Partial<RxEntry["schedules"][number]>,
  ) => void;
}) {
  const selectedRx = prescriptions.find((p) => p.id === entry.prescriptionId);

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={entry.prescriptionId || ""}
          onValueChange={(val) => onSelectPrescription(val)}
        >
          <SelectTrigger className="flex-1 h-9 text-sm">
            <SelectValue placeholder="Select prescription..." />
          </SelectTrigger>
          <SelectContent>
            {prescriptions.map((rx) => (
              <SelectItem
                key={rx.id}
                value={rx.id}
                disabled={existingRxIds.includes(rx.id) && rx.id !== entry.prescriptionId}
              >
                {rx.genericName}
                {rx.indication ? ` (${rx.indication})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRemove}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Prefill button when prescription selected but schedules are empty/default */}
      {selectedRx && (
        <PrefillFromMaintenance
          prescriptionId={selectedRx.id}
          onPrefill={(schedules) => onUpdate({ schedules })}
        />
      )}

      {/* Schedule rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Titration doses
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-teal-600 dark:text-teal-400"
            onClick={onAddSchedule}
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add time
          </Button>
        </div>

        {entry.schedules.map((sched, schedIdx) => (
          <div
            key={schedIdx}
            className="flex items-center gap-2 bg-muted/30 rounded-lg p-2"
          >
            <Input
              type="time"
              value={sched.time}
              onChange={(e) => onUpdateSchedule(schedIdx, { time: e.target.value })}
              className="w-28 h-8 text-sm"
            />
            <Input
              type="number"
              step="any"
              placeholder="mg"
              value={sched.dosage}
              onChange={(e) =>
                onUpdateSchedule(schedIdx, { dosage: e.target.value })
              }
              className="w-20 h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">mg</span>
            {entry.schedules.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 ml-auto"
                onClick={() => onRemoveSchedule(schedIdx)}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prefill from maintenance: loads current schedules and offers to copy them
// ---------------------------------------------------------------------------

function PrefillFromMaintenance({
  prescriptionId,
  onPrefill,
}: {
  prescriptionId: string;
  onPrefill: (schedules: RxEntry["schedules"]) => void;
}) {
  const phases = usePhasesForPrescription(prescriptionId);
  const maintenancePhase = phases.find(
    (p) => p.type === "maintenance" && p.status === "active",
  );
  const schedules = useSchedulesForPhase(maintenancePhase?.id);

  if (!maintenancePhase || schedules.length === 0) return null;

  const handlePrefill = () => {
    onPrefill(
      schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: String(s.dosage),
      })),
    );
  };

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
      <div className="space-y-0.5">
        <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider">
          Current maintenance
        </span>
        {schedules.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 text-[11px] text-blue-600 dark:text-blue-400"
          >
            <Clock className="w-3 h-3" />
            <span>{s.time}</span>
            <span>{s.dosage}{maintenancePhase.unit}</span>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] gap-1 shrink-0 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
        onClick={handlePrefill}
      >
        Copy to titration
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit phase schedule loader — populates entry schedules from existing phase
// ---------------------------------------------------------------------------

function EditPhaseScheduleLoader({
  phaseId,
  entryIdx,
  onLoad,
}: {
  phaseId: string;
  entryIdx: number;
  onLoad: (schedules: RxEntry["schedules"]) => void;
}) {
  const schedules = useSchedulesForPhase(phaseId);
  const [loaded, setLoaded] = useState(false);

  if (schedules.length > 0 && !loaded) {
    onLoad(
      schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: String(s.dosage),
      })),
    );
    setLoaded(true);
  }

  return null;
}

