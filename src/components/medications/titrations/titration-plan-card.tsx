"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
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
  usePhasesForTitrationPlan,
  usePrescriptions,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { MedicationPhase, TitrationPlan } from "@/lib/db";
import { cn } from "@/lib/utils";
import { DAY_LABELS_LONG } from "./types";

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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                          disabled={completeMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3" />
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
                          <AlertDialogAction
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => completeMutation.mutate(plan.id)}
                          >
                            Complete &amp; Promote
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-red-500 hover:text-red-600"
                          disabled={cancelMutation.isPending}
                        >
                          <XCircle className="w-3 h-3" />
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
                            className="bg-red-600 hover:bg-red-700"
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
                  ({s.daysOfWeek.map((d) => DAY_LABELS_LONG[d]).join(", ")})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
