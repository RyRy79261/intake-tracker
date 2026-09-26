"use client";

import { useState } from "react";
import { CalendarClock, Play } from "lucide-react";
import { Card } from "@intake/ui/card";
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
} from "@intake/ui/alert-dialog";
import { useToast } from "@intake/ui/use-toast";
import {
  useActivateTitrationPlan,
  useDueTitrationPlans,
} from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import type { TitrationPlan } from "@/lib/db";
import { cn } from "@/lib/utils";

function formatPlannedDate(ts: number | undefined): string {
  if (ts == null) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Prompt for titration steps whose planned start date has arrived. A step
 * never starts on its own: the previous regimen stays in effect until the
 * user confirms here, which activates the plan (the same flow as the plan
 * card's Activate button). "Not now" hides the prompt until the screen is
 * opened again.
 */
export function TitrationStartPrompt({ className }: { className?: string }) {
  const todayKey = useTodayKey();
  const duePlans = useDueTitrationPlans(todayKey);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<TitrationPlan | null>(null);
  const activate = useActivateTitrationPlan();
  const { toast } = useToast();

  const visible = duePlans.filter((p) => !dismissed.has(p.id));
  if (visible.length === 0 && !confirming) return null;

  function confirmStart() {
    if (!confirming) return;
    const plan = confirming;
    activate.mutate(plan.id, {
      onSuccess: () => {
        toast({
          title: "Titration started",
          description: `${plan.title} is now your active schedule.`,
          variant: "success",
        });
      },
      onError: (e: Error) => {
        toast({
          title: "Couldn't start titration",
          description: e.message,
          variant: "destructive",
        });
      },
      onSettled: () => setConfirming(null),
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((plan) => (
        <Card
          key={plan.id}
          role="status"
          className="p-3 border-teal-300 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/20"
        >
          <div className="flex items-start gap-2">
            <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold">
                Ready to start: {plan.title}
              </p>
              <p className="text-xs text-muted-foreground">
                Planned for {formatPlannedDate(plan.recommendedStartDate)}. Your
                current doses stay in effect until you start it.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-teal-600 hover:bg-teal-700"
                  disabled={activate.isPending}
                  onClick={() => setConfirming(plan)}
                >
                  <Play className="w-3 h-3" />
                  Start now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={activate.isPending}
                  onClick={() =>
                    setDismissed((prev) => new Set(prev).add(plan.id))
                  }
                >
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next && !activate.isPending) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start {confirming?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              From now on your schedule uses this titration&apos;s doses
              instead of your current ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmStart();
              }}
              disabled={activate.isPending}
            >
              Start titration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
