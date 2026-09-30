"use client";

import { useState } from "react";
import { Button } from "@intake/ui/button";
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
} from "@intake/ui/alert-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useActivateTitrationPlan,
  useCancelTitrationPlan,
  useCompleteTitrationPlan,
  useDeleteTitrationPlan,
  useInventoryForPrescription,
  usePhasesForTitrationPlan,
  usePrescriptions,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import { findActiveBrand } from "@/lib/dose-preview";
import type { MedicationPhase, TitrationPlan } from "@/lib/db";
import { cn } from "@/lib/utils";
import { DAY_LABELS_LONG } from "@/components/medications/titrations/types";
import { sortDaysForDisplay } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { formatComboDose } from "@intake/core/compound";
import { Bdg, type BdgTone } from "@/components/medications/ward-bits";

export function TitrationPlanCard({
  plan, onEdit,
}: {
  plan: TitrationPlan;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const phases = usePhasesForTitrationPlan(plan.id);

  const activateMutation = useActivateTitrationPlan();
  const completeMutation = useCompleteTitrationPlan();
  const cancelMutation = useCancelTitrationPlan();
  const deleteMutation = useDeleteTitrationPlan();

  const STATUS: Record<TitrationPlan["status"], { label: string; tone: BdgTone; kind: "outline" | "fill" }> = {
    active: { label: "Active", tone: "weight", kind: "fill" },
    draft: { label: "Draft", tone: "water", kind: "outline" },
    completed: { label: "Completed", tone: "muted", kind: "outline" },
    cancelled: { label: "Cancelled", tone: "muted", kind: "outline" },
  };
  const status = STATUS[plan.status] ?? STATUS.draft;

  const startDateLabel = plan.recommendedStartDate
    ? new Date(plan.recommendedStartDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const isActive = plan.status === "active";
  const meta = [
    plan.conditionLabel,
    `${phases.length} prescription${phases.length !== 1 ? "s" : ""}`,
    startDateLabel && (plan.status === "draft" ? `Starts ${startDateLabel}` : startDateLabel),
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-testid="titration-plan"
      className={cn(
        "mb-2 border bg-background",
        isActive ? "border-2 border-weight" : "border-line",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-12 w-full flex-col gap-1 py-2.5 pl-3 pr-2 text-left hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex items-center gap-2">
          <b className="min-w-0 flex-1 font-semibold">{plan.title}</b>
          <Bdg tone={status.tone} kind={status.kind}>{status.label}</Bdg>
          <ChevronDown
            aria-hidden="true"
            className={cn("h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        </span>
        <span className="text-[0.8125rem] text-muted-foreground">{meta}</span>
      </button>

      {plan.warnings && plan.warnings.length > 0 && (isActive || expanded) && (
        <div className="flex flex-col gap-1 px-3 pb-2">
          {plan.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[0.8125rem] text-sodium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-2.5 border-t border-line px-3 pb-3 pt-2.5 text-sm">
          {phases.map((phase) => (
            <PhaseEntryRow key={phase.id} phase={phase} />
          ))}

          {plan.notes && (
            <p className="text-[0.8125rem] text-muted-foreground">{plan.notes}</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
            {(plan.status === "draft" || plan.status === "active") && (
              <Button variant="outline" onClick={onEdit}>
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            )}
            {plan.status === "draft" && (
              <Button
                onClick={() => activateMutation.mutate(plan.id)}
                disabled={activateMutation.isPending}
              >
                <Play aria-hidden="true" />
                Activate
              </Button>
            )}
            {plan.status === "active" && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={completeMutation.isPending}>
                      <CheckCircle2 aria-hidden="true" />
                      Complete &amp; Promote
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Complete titration?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This finishes &ldquo;{plan.title}&rdquo; and promotes its
                        doses to become the new maintenance schedule for every
                        prescription in the plan. This replaces the current
                        baseline and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => completeMutation.mutate(plan.id)}>
                        Complete &amp; Promote
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-bp text-bp hover:text-bp"
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle aria-hidden="true" />
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel titration?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &ldquo;{plan.title}&rdquo; will stop and every affected
                        prescription reverts to its maintenance schedule.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep running</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-bp text-on-domain hover:bg-bp/90"
                        onClick={() => cancelMutation.mutate(plan.id)}
                      >
                        Cancel titration
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {(plan.status === "draft" || plan.status === "cancelled") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-bp text-bp hover:text-bp"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 aria-hidden="true" />
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
                      className="bg-bp text-on-domain hover:bg-bp/90"
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
      )}
    </div>
  );
}

function PhaseEntryRow({ phase }: { phase: MedicationPhase }) {
  const prescriptions = usePrescriptions();
  const schedules = useSchedulesForPhase(phase.id);

  const inventoryItems = useInventoryForPrescription(phase.prescriptionId);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

  const rx = prescriptions.find((p) => p.id === phase.prescriptionId);
  // Combination doses are labelled from the active brand's tablets; with no
  // combo brand stocked the summed dose is shown.
  const activeBrand = findActiveBrand(inventoryItems);

  const status = phase.status;
  return (
    <div className="flex flex-col gap-1 border border-line bg-panel px-2.5 py-2 text-[0.8125rem]">
      <div className="flex items-center justify-between gap-2">
        <b className="font-semibold">{rx?.genericName ?? "Removed prescription"}</b>
        <Bdg tone={status === "active" ? "weight" : status === "pending" ? "water" : "muted"}>
          {status}
        </Bdg>
      </div>
      {schedules.map((s) => (
        <p key={s.id}>
          <span className="font-mono text-muted-foreground">{s.time}</span>{" "}
          <b className="font-semibold">{formatComboDose(s.dosage, phase.unit, activeBrand)}</b>
          {s.daysOfWeek.length < 7 && (
            <span className="text-muted-foreground">
              {" "}({sortDaysForDisplay(s.daysOfWeek, weekStartsOn).map((d) => DAY_LABELS_LONG[d]).join(", ")})
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
