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
  }
>(
  (
    {
      className,
      value,
      indicatorClassName,
      extendedValue,
      extendedIndicatorClassName,
      ...props
    },
    ref
  ) => {
    const primary = Math.max(0, Math.min(100, value ?? 0));
    const hasExtended = extendedValue !== undefined;
    const extended = hasExtended
      ? Math.max(0, Math.min(100 - primary, extendedValue ?? 0))
      : 0;

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
      </ProgressPrimitive.Root>
    );
  }
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
