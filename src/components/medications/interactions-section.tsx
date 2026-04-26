"use client";

import { ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRefreshInteractions } from "@/hooks/use-interaction-check";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import { useToast } from "@/hooks/use-toast";
import type { Prescription } from "@/lib/db";

interface InteractionsSectionProps {
  prescription: Prescription;
}

export function InteractionsSection({ prescription }: InteractionsSectionProps) {
  const { refresh, isRefreshing } = useRefreshInteractions();
  const prescriptions = usePrescriptions();
  const { toast } = useToast();

  const hasData =
    (prescription.contraindications?.length ?? 0) > 0 ||
    (prescription.warnings?.length ?? 0) > 0;

  const handleRefresh = async () => {
    const activePrescriptions = prescriptions.filter(
      (p) => p.id !== prescription.id && p.isActive
    );

    if (activePrescriptions.length === 0) {
      // No other active prescriptions to check against
      return;
    }

    const result = await refresh(
      prescription.id,
      prescription.genericName,
      activePrescriptions.map((p) => ({ genericName: p.genericName }))
    );

    if (result && "error" in result && result.error === "offline") {
      toast({
        title: "AI offline",
        description: "Connect to the internet to refresh interactions.",
        variant: "default",
      });
    } else if (result === null) {
      toast({
        title: "Refresh failed",
        description: "Couldn't refresh interactions. Try again later.",
        variant: "destructive",
      });
    }
  };

  const otherActiveCount = prescriptions.filter(
    (p) => p.id !== prescription.id && p.isActive
  ).length;

  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <ShieldAlert className="w-4 h-4" />
        Interactions & Warnings
      </h3>

      {hasData ? (
        <div>
          {prescription.contraindications?.map((text, i) => (
            <div
              key={`c-${i}`}
              className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 mb-1.5"
            >
              <Badge variant="destructive" className="text-[10px] shrink-0">
                AVOID
              </Badge>
              <span className="text-xs">{text}</span>
            </div>
          ))}

          {prescription.warnings?.map((text, i) => {
            const isDrugClass = text.startsWith("Drug class:");
            return (
              <div
                key={`w-${i}`}
                className={`flex items-start gap-2 p-2 rounded-md mb-1.5 ${
                  isDrugClass
                    ? "bg-muted"
                    : "bg-amber-50 dark:bg-amber-950/30"
                }`}
              >
                {isDrugClass ? (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    INFO
                  </Badge>
                ) : (
                  <Badge className="text-[10px] shrink-0 bg-amber-500 hover:bg-amber-600 text-white">
                    CAUTION
                  </Badge>
                )}
                <span className="text-xs">{text}</span>
              </div>
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            className="text-xs mt-2 w-full"
            onClick={handleRefresh}
            disabled={isRefreshing || otherActiveCount === 0}
          >
            {isRefreshing ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            {otherActiveCount === 0
              ? "Add more prescriptions to check interactions"
              : "Refresh interactions"}
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-md text-center">
          No interaction data yet
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleRefresh}
              disabled={isRefreshing || otherActiveCount === 0}
            >
              {isRefreshing ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              {otherActiveCount === 0
                ? "Add more prescriptions to check interactions"
                : "Refresh interactions"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
