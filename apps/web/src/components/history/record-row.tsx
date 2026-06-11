"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, Pencil } from "lucide-react";
import { CARD_THEMES } from "@/lib/card-themes";
import { type UnifiedRecord } from "@/lib/history-types";
import { formatTimeOnly } from "@/lib/date-utils";
import { getLiquidTypeLabel } from "@/lib/utils";
import { type LiquidPreset } from "@/lib/constants";

interface RecordRowProps {
  unified: UnifiedRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
  liquidPresets?: LiquidPreset[];
}

/** A single record row in the history list */
function RecordRowImpl({ unified, onDelete, onEdit, isDeleting, liquidPresets }: RecordRowProps) {
  let icon: React.ReactNode;
  let measurement: string;
  let iconColor: string;
  let typeLabel: string;

  if (unified.type === "intake") {
    const record = unified.record;
    const themeKey =
      record.type === "water" ? "water" : record.type === "sugar" ? "sugar" : "salt";
    const theme = CARD_THEMES[themeKey];
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    const unit =
      record.type === "water" ? "ml" : record.type === "sugar" ? "g" : "mg";
    const amountStr = `${record.amount} ${unit}`;
    const sourceLabel = record.type === "water"
      ? getLiquidTypeLabel(record.source, { presets: liquidPresets, note: record.note })
      : null;
    measurement = sourceLabel ? `${amountStr} · ${sourceLabel}` : amountStr;
  } else if (unified.type === "weight") {
    const theme = CARD_THEMES.weight;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    measurement = `${unified.record.weight} kg`;
  } else if (unified.type === "eating") {
    const theme = CARD_THEMES.eating;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    measurement = unified.record.note ? unified.record.note : "—";
  } else if (unified.type === "urination") {
    const theme = CARD_THEMES.urination;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    const parts = [unified.record.amountEstimate, unified.record.note].filter(Boolean);
    measurement = parts.length > 0 ? parts.join(" · ") : "—";
  } else if (unified.type === "defecation") {
    const theme = CARD_THEMES.defecation;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    const parts = [unified.record.amountEstimate, unified.record.note].filter(Boolean);
    measurement = parts.length > 0 ? parts.join(" · ") : "—";
  } else if (unified.type === "caffeine") {
    const theme = CARD_THEMES.caffeine;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    const amt = unified.record.amountMg ? `${unified.record.amountMg} mg` : "";
    measurement = [unified.record.description, amt].filter(Boolean).join(" · ") || "Caffeine";
  } else if (unified.type === "alcohol") {
    const theme = CARD_THEMES.alcohol;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    const amt = unified.record.amountStandardDrinks
      ? `${unified.record.amountStandardDrinks} drink${unified.record.amountStandardDrinks !== 1 ? "s" : ""}`
      : "";
    measurement = [unified.record.description, amt].filter(Boolean).join(" · ") || "Alcohol";
  } else {
    const theme = CARD_THEMES.bp;
    const Icon = theme.icon;
    icon = <Icon className="w-4 h-4" />;
    iconColor = theme.iconColor;
    typeLabel = theme.label;
    measurement = `${unified.record.systolic}/${unified.record.diastolic} mmHg`;
  }

  return (
    <div
      className="flex items-center justify-between py-2 px-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={iconColor}>{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">
            {typeLabel}
          </span>
          <span className="font-medium truncate leading-tight">{measurement}</span>
        </div>
        <span className="text-sm text-muted-foreground shrink-0">
          {formatTimeOnly(unified.record.timestamp)}
        </span>
      </div>
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={onEdit}
          aria-label="Edit entry"
          title="Edit entry"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete entry"
          title="Delete entry"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

export const RecordRow = memo(RecordRowImpl);
