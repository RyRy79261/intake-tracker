"use client";

import { memo, type CSSProperties } from "react";
import { Trash2, Pencil } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { CARD_THEMES, type CardTheme } from "@/lib/card-themes";
import { domainColor } from "@/lib/domain-colors";
import { type UnifiedRecord } from "@/lib/history-types";
import { formatTimeOnly } from "@/lib/date-utils";
import { getLiquidTypeLabel } from "@/lib/utils";
import { type LiquidPreset } from "@/lib/constants";
import type { IntakeRecord } from "@/lib/db";
import { describeSodiumEntry } from "@intake/core/sodium";

const INTAKE_UNITS: Record<IntakeRecord["type"], string> = {
  water: "ml",
  salt: "mg",
  sugar: "g",
  potassium: "mg",
};

interface RecordRowProps {
  unified: UnifiedRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
  liquidPresets?: LiquidPreset[];
}

/** The theme (label, icon, colour) and the measurement text of a record. */
function describeRecord(
  unified: UnifiedRecord,
  liquidPresets: LiquidPreset[] | undefined,
): { theme: CardTheme; measurement: string } {
  switch (unified.type) {
    case "intake": {
      const record = unified.record;
      const amountStr = `${record.amount} ${INTAKE_UNITS[record.type]}`;
      // Water: the liquid it came from. Sodium: the salt/MSG it was typed as
      // (null for sodium typed directly, and for rows with no recorded source).
      const sourceLabel = record.type === "water"
        ? getLiquidTypeLabel(record.source, { presets: liquidPresets, note: record.note })
        : record.type === "salt"
          ? describeSodiumEntry(record)
          : null;
      // Each intake type has its own theme key of the same name.
      return {
        theme: CARD_THEMES[record.type],
        measurement: sourceLabel ? `${amountStr} · ${sourceLabel}` : amountStr,
      };
    }
    case "weight":
      return { theme: CARD_THEMES.weight, measurement: `${unified.record.weight} kg` };
    case "eating": {
      const grams = unified.record.grams != null ? `${unified.record.grams} g` : "";
      return {
        theme: CARD_THEMES.eating,
        measurement: [unified.record.note, grams].filter(Boolean).join(" · ") || "—",
      };
    }
    case "urination":
    case "defecation": {
      const parts = [unified.record.amountEstimate, unified.record.note].filter(Boolean);
      return {
        theme: CARD_THEMES[unified.type],
        measurement: parts.length > 0 ? parts.join(" · ") : "—",
      };
    }
    case "caffeine": {
      const amt = unified.record.amountMg ? `${unified.record.amountMg} mg` : "";
      return {
        theme: CARD_THEMES.caffeine,
        measurement: [unified.record.description, amt].filter(Boolean).join(" · ") || "Caffeine",
      };
    }
    case "alcohol": {
      const drinks = unified.record.amountStandardDrinks;
      const amt = drinks ? `${drinks} drink${drinks !== 1 ? "s" : ""}` : "";
      return {
        theme: CARD_THEMES.alcohol,
        measurement: [unified.record.description, amt].filter(Boolean).join(" · ") || "Alcohol",
      };
    }
    default:
      return {
        theme: CARD_THEMES.bp,
        measurement: `${unified.record.systolic}/${unified.record.diastolic} mmHg`,
      };
  }
}

/**
 * A single record in the Metrics › Records list: the whole left side is the
 * edit button (icon, type label, measurement, time), with Edit and Delete
 * icon buttons beside it. Coloured by its domain.
 */
function RecordRowImpl({ unified, onDelete, onEdit, isDeleting, liquidPresets }: RecordRowProps) {
  const { theme, measurement } = describeRecord(unified, liquidPresets);
  const Icon = theme.icon;
  // Potassium has no domain colour of its own; the prototype inks it.
  const isPotassium = unified.type === "intake" && unified.record.type === "potassium";
  const color = isPotassium ? "hsl(var(--fg))" : domainColor(theme.domain);
  const time = formatTimeOnly(unified.record.timestamp);

  return (
    <div className="wm-rec" style={{ "--c": color } as CSSProperties} data-testid="record-row">
      <button
        type="button"
        className="main"
        onClick={onEdit}
        aria-label={`${theme.label} ${measurement} at ${time}, edit`}
      >
        <Icon aria-hidden="true" />
        <span className="tx">
          <span className="lb">{theme.label}</span>
          <span className="ms">{measurement}</span>
        </span>
        <span className="tm">{time}</span>
      </button>
      <button
        type="button"
        className="wm-ibtn"
        onClick={onEdit}
        aria-label="Edit entry"
        title="Edit entry"
      >
        <Pencil />
      </button>
      <button
        type="button"
        className="wm-ibtn"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label="Delete entry"
        title="Delete entry"
      >
        {isDeleting ? <Spinner /> : <Trash2 />}
      </button>
    </div>
  );
}

export const RecordRow = memo(RecordRowImpl);
