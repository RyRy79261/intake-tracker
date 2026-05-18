"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

export type ConflictCheckState = "idle" | "checking" | "warning" | "unavailable";

interface ConflictItem {
  severity: "AVOID" | "CAUTION" | string;
  medication: string;
  description: string;
}

interface ConflictData {
  summary?: string;
  interactions: ConflictItem[];
}

export function ConflictCheckOverlay({
  state, data, onDismiss, onConfirm,
}: {
  state: ConflictCheckState;
  data: ConflictData | null;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  if (state === "checking") {
    return (
      <div className="absolute inset-0 bg-background/95 z-10 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Checking for interactions...</p>
      </div>
    );
  }

  if (state !== "warning" || !data) return null;

  return (
    <div className="absolute inset-0 bg-background/95 z-10 flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="text-sm font-semibold">Interaction Warning</h3>
      </div>

      {data.summary && (
        <p className="text-xs text-muted-foreground mb-3">{data.summary}</p>
      )}

      {data.interactions
        .filter((i) => i.severity === "AVOID" || i.severity === "CAUTION")
        .map((item, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 p-2 rounded-md mb-2 ${
              item.severity === "AVOID"
                ? "bg-red-50 dark:bg-red-950/30"
                : "bg-amber-50 dark:bg-amber-950/30"
            }`}
          >
            <Badge
              {...(item.severity === "AVOID"
                ? { variant: "destructive" as const }
                : {})}
              className={`text-[10px] shrink-0 ${
                item.severity === "CAUTION"
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : ""
              }`}
            >
              {item.severity}
            </Badge>
            <div className="text-xs">
              <span className="font-medium">{item.medication}:</span>{" "}
              {item.description}
            </div>
          </div>
        ))}

      <div className="flex gap-3 mt-auto pt-4">
        <Button variant="outline" className="flex-1" onClick={onDismiss}>
          Go Back
        </Button>
        <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={onConfirm}>
          I&apos;m Aware, Save Anyway
        </Button>
      </div>
    </div>
  );
}
