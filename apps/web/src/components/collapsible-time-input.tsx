"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { getCurrentDateTimeLocal } from "@/lib/date-utils";

interface CollapsibleTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
  id?: string;
  label?: string;
}

/**
 * Collapsible "Set different time" section used in weight, BP,
 * and manual-input-dialog.
 */
export function CollapsibleTimeInput({
  value,
  onChange,
  maxDate,
  id = "custom-time",
  label = "When was this measured?",
}: CollapsibleTimeInputProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-between text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {expanded ? "Using custom time" : "Set different time"}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </Button>

      {expanded && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <Label htmlFor={id} className="text-sm">
            {label}
          </Label>
          <Input
            id={id}
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={maxDate ?? getCurrentDateTimeLocal()}
            className="mt-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Variant that exposes the expanded state to the parent
 * (for cases where the parent needs to know if a custom time was chosen).
 */
export function CollapsibleTimeInputControlled({
  value,
  onChange,
  expanded,
  onToggle,
  maxDate,
  id = "custom-time",
  label = "When was this measured?",
}: CollapsibleTimeInputProps & {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-between text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {expanded ? "Using custom time" : "Set different time"}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </Button>

      {expanded && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <Label htmlFor={id} className="text-sm">
            {label}
          </Label>
          <Input
            id={id}
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={maxDate ?? getCurrentDateTimeLocal()}
            className="mt-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
