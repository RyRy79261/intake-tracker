"use client";

import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/utils";
import { type ParsedIntake } from "@/lib/perplexity";

interface ParsedIntakeDisplayProps {
  result: ParsedIntake;
  onTryAgain: () => void;
  onConfirm: () => void;
  isProcessing: boolean;
}

/**
 * Displays the AI-parsed water/salt result with confirm/retry actions.
 */
export function ParsedIntakeDisplay({
  result,
  onTryAgain,
  onConfirm,
  isProcessing,
}: ParsedIntakeDisplayProps) {
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg bg-muted/50 border">
        <p className="text-sm text-muted-foreground mb-3">Parsed result:</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30">
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">
              {result.water != null ? formatAmount(result.water, "ml") : "0ml"}
            </p>
            <p className="text-xs text-muted-foreground">Water</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {result.salt != null ? formatAmount(result.salt, "mg") : "0mg"}
            </p>
            <p className="text-xs text-muted-foreground">Salt</p>
          </div>
        </div>
        {result.reasoning != null && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            {result.reasoning}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onTryAgain} className="flex-1">
          Try Again
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isProcessing || (result.water == null && result.salt == null)}
          className="flex-1 bg-violet-600 hover:bg-violet-700"
        >
          {isProcessing ? "Adding..." : "Confirm & Add"}
        </Button>
      </div>
    </div>
  );
}
