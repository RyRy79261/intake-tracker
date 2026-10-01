"use client";

import { Badge } from "@intake/ui/badge";
import { Button } from "@intake/ui/button";
import { AlertTriangle } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";

export type ConflictCheckState = "idle" | "checking" | "warning" | "unavailable";

interface ConflictItem {
  // Upstream useInteractionCheck returns "OK" too; the overlay filters
  // it out so it never renders, but the type must accept it.
  severity: "AVOID" | "CAUTION" | "OK";
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
      <div className="absolute inset-0 bg-panel z-10 flex flex-col items-center justify-center p-4">
        <Spinner className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Checking for interactions...</p>
      </div>
    );
  }

  if (state !== "warning" || !data) return null;

  return (
    <div className="absolute inset-0 bg-panel z-10 flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-sodium" aria-hidden="true" />
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
            className={`mb-2 flex items-start gap-2 border p-2 ${
              item.severity === "AVOID" ? "border-bp bg-bp/8" : "border-sodium bg-sodium/8"
            }`}
          >
            <Badge
              {...(item.severity === "AVOID"
                ? { variant: "destructive" as const }
                : {})}
              className={`shrink-0 text-[0.625rem] ${
                item.severity === "CAUTION" ? "border-sodium bg-sodium text-on-domain" : "border-bp bg-bp text-on-domain"
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
        <Button className="flex-1" onClick={onConfirm}>
          I&apos;m Aware, Save Anyway
        </Button>
      </div>
    </div>
  );
}
