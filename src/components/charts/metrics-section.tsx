"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { GraphData } from "@/hooks/use-graph-data";

export function MetricsSection({ data }: { data: GraphData }) {
  const { metrics } = data;
  const hasAny =
    metrics.avgWeight != null ||
    metrics.avgBPSitting != null ||
    metrics.avgBPStanding != null ||
    metrics.avgHeartRate != null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground hover:text-foreground group"
        >
          <span>Metrics</span>
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {!hasAny ? (
          <p className="text-sm text-muted-foreground py-2">
            No metrics in this range.
          </p>
        ) : (
          <ul className="space-y-2 py-2 text-sm">
            {metrics.avgWeight != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. weight</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {metrics.avgWeight.toFixed(1)} kg
                </span>
              </li>
            )}
            {metrics.avgBPSitting != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. BP (sitting)</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {metrics.avgBPSitting.systolic.toFixed(0)}/
                  {metrics.avgBPSitting.diastolic.toFixed(0)} mmHg
                </span>
              </li>
            )}
            {metrics.avgBPStanding != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. BP (standing)</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {metrics.avgBPStanding.systolic.toFixed(0)}/
                  {metrics.avgBPStanding.diastolic.toFixed(0)} mmHg
                </span>
              </li>
            )}
            {metrics.avgHeartRate != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. heart rate</span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {metrics.avgHeartRate.toFixed(0)} bpm
                </span>
              </li>
            )}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
