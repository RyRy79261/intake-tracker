"use client";

import { Button } from "@intake/ui/button";
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
      <span className="flex items-center gap-1 text-xs font-medium text-weight">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Enabled
      </span>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-bp">
          <X className="w-3.5 h-3.5" />
          Blocked
        </span>
        {onReset && (
          <Button variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={onReset}>
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
    <Button variant="outline" className="h-9 border-muted-foreground" onClick={onRequest}>
      Enable
    </Button>
  );
}
