"use client";

import * as React from "react";
import { cn } from "../lib/utils";

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
  /**
   * Clamp the typed value into [min, max] on blur (default true). Pass false
   * when the parent validates the range itself, so an out-of-range reading
   * surfaces as an error instead of being silently replaced by the bound.
   */
  clamp?: boolean;
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
      clamp = true,
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

      // Number() (not parseFloat) so "72.4kg" or "7o" is rejected instead
      // of being truncated to its numeric prefix. A single comma is read as
      // the decimal separator (locale keypads with inputMode="decimal").
      const parsed = Number(editValue.trim().replace(",", "."));
      if (!Number.isFinite(parsed)) {
        // Invalid input — revert silently
        return;
      }

      // Clamp to [min, max]
      const clamped = clamp ? Math.max(min, Math.min(max, parsed)) : parsed;

      // Apply rounding if provided
      const rounded = roundOnBlur ? roundOnBlur(clamped) : clamped;

      onValueChange(rounded);
    }, [editValue, min, max, clamp, roundOnBlur, onValueChange]);

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
      <label className={cn("cursor-text inline-flex items-center", className)}>
        {/* Inner row keeps the value and its suffix on one baseline while the
            label itself can stretch to fill (and centre in) its container. */}
        <span className="inline-flex items-baseline">
        <span className={cn(displayClassName, isEditing && "border-b-2 border-ring")}>
          {isEditing ? editValue : formatDisplay(value)}
          {isEditing && (
            // The real input is visually hidden, so draw the caret here, in
            // the focus-ring colour like a native caret (`caret-ring`).
            <span
              aria-hidden="true"
              data-testid="inline-edit-caret"
              className="ml-px inline-block h-[1em] w-0.5 translate-y-[0.15em] animate-pulse bg-ring motion-reduce:animate-none"
            />
          )}
        </span>
        {suffix && <span className={suffixClassName}>{suffix}</span>}
        </span>
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
