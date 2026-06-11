"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

interface NumericInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  min: number;
  max: number;
  step: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Numeric input with increment/decrement buttons.
 * Reusable across settings sections and any future numeric controls.
 */
export function NumericInput({
  id,
  value,
  onChange,
  onBlur,
  min,
  max,
  step,
  onIncrement,
  onDecrement,
}: NumericInputProps) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={onDecrement}
        aria-label="Decrease value"
      >
        <Minus className="w-4 h-4" aria-hidden="true" />
      </Button>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={onIncrement}
        aria-label="Increase value"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
