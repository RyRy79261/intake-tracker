"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InlineEditProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onBlur" | "min" | "max"
  > {
  /** Current numeric value */
  value: number | null;
  /** Callback when value changes (on blur, after rounding) */
  onValueChange: (value: number) => void;
  /** Format function for display text (e.g., v => `${v.toFixed(2)}`) */
  formatDisplay: (value: number | null) => string;
  /** Rounding function applied on blur (e.g., round to nearest 0.05) */
  roundOnBlur?: (value: number) => number;
  /** Suffix text rendered after the value (e.g., "kg") */
  suffix?: string;
  /** className for the display text span */
  displayClassName?: string;
  /** className for the suffix span */
  suffixClassName?: string;
  /** Minimum valid value (default 0) */
  min?: number;
  /** Maximum valid value (default 100000) */
  max?: number;
}

const InlineEdit = React.forwardRef<HTMLInputElement, InlineEditProps>(
  (
    {
      value,
      onValueChange,
      formatDisplay,
      roundOnBlur,
      suffix,
      displayClassName,
      suffixClassName,
      min = 0,
      max = 100000,
      className,
      type,
      inputMode,
      step,
      "aria-label": ariaLabel,
      ...restProps
    },
    ref
  ) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState("");
    const internalRef = React.useRef<HTMLInputElement | null>(null);

    // Merge forwarded ref with internal ref
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [ref]
    );

    const handleFocus = React.useCallback(() => {
      setIsEditing(true);
      setEditValue(value != null ? formatDisplay(value) : "");
    }, [value, formatDisplay]);

    const handleBlur = React.useCallback(() => {
      setIsEditing(false);

      if (editValue.trim() === "") {
        // Empty input — revert silently, do not call onValueChange
        return;
      }

      const parsed = parseFloat(editValue);
      if (isNaN(parsed)) {
        // Invalid input — revert silently
        return;
      }

      // Clamp to [min, max]
      const clamped = Math.max(min, Math.min(max, parsed));

      // Apply rounding if provided
      const rounded = roundOnBlur ? roundOnBlur(clamped) : clamped;

      onValueChange(rounded);
    }, [editValue, min, max, roundOnBlur, onValueChange]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditValue(e.target.value);
      },
      []
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      },
      []
    );

    return (
      <label className={cn("cursor-text inline-flex items-baseline", className)}>
        <span className={cn(displayClassName, isEditing && "border-b-2 border-current")}>
          {isEditing ? editValue : formatDisplay(value)}
        </span>
        {suffix && <span className={suffixClassName}>{suffix}</span>}
        <input
          ref={mergedRef}
          type={type ?? "text"}
          inputMode={inputMode}
          step={step}
          className="sr-only"
          value={isEditing ? editValue : ""}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          {...restProps}
        />
      </label>
    );
  }
);

InlineEdit.displayName = "InlineEdit";

export { InlineEdit };
