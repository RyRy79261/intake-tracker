"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    extendedValue?: number;
    extendedIndicatorClassName?: string;
    /**
     * Optional position (0-100%) of a thin target-line marker overlaid on
     * the bar. Used in two-stage mode to keep the daily target visible
     * even when the extended segment is still empty.
     */
    targetMarkerPct?: number;
    targetMarkerClassName?: string;
  }
>(
  (
    {
      className,
      value,
      indicatorClassName,
      extendedValue,
      extendedIndicatorClassName,
      targetMarkerPct,
      targetMarkerClassName,
      ...props
    },
    ref
  ) => {
    const primary = Math.max(0, Math.min(100, value ?? 0));
    const hasExtended = extendedValue !== undefined && extendedValue > 0;
    const extended = hasExtended
      ? Math.max(0, Math.min(100 - primary, extendedValue ?? 0))
      : 0;
    const showMarker =
      targetMarkerPct !== undefined &&
      targetMarkerPct > 0 &&
      targetMarkerPct < 100;

    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
          className
        )}
        {...props}
      >
        {hasExtended ? (
          <>
            <div
              className={cn(
                "absolute top-0 left-0 h-full transition-all duration-300 ease-out",
                indicatorClassName || "bg-primary"
              )}
              style={{ width: `${primary}%` }}
            />
            <div
              className={cn(
                "absolute top-0 h-full transition-all duration-300 ease-out",
                extendedIndicatorClassName || "bg-primary"
              )}
              style={{ left: `${primary}%`, width: `${extended}%` }}
            />
          </>
        ) : (
          <ProgressPrimitive.Indicator
            className={cn(
              "h-full w-full flex-1 transition-all duration-300 ease-out",
              indicatorClassName || "bg-primary"
            )}
            style={{ transform: `translateX(-${100 - primary}%)` }}
          />
        )}
        {showMarker && (
          <div
            aria-hidden="true"
            className={cn(
              "absolute top-0 h-full w-0.5 bg-foreground/40 dark:bg-foreground/50",
              targetMarkerClassName
            )}
            style={{ left: `calc(${targetMarkerPct}% - 1px)` }}
          />
        )}
      </ProgressPrimitive.Root>
    );
  }
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
