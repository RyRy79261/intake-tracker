"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react";
import { type PermissionState } from "@/hooks/use-permissions";

interface PermissionBadgeProps {
  state: PermissionState;
  onRequest: () => void;
  onReset?: () => void;
}

/**
 * Displays a permission status badge with contextual actions.
 */
export function PermissionBadge({ state, onRequest, onReset }: PermissionBadgeProps) {
  if (state === "granted") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Enabled
      </span>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <X className="w-3.5 h-3.5" />
          Blocked
        </span>
        {onReset && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <span className="text-xs text-muted-foreground">
        Not available
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onRequest}>
      Enable
    </Button>
  );
}
