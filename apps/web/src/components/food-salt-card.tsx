"use client";

import { progressStatusTextClass } from "@intake/ui/progress";
import { Utensils } from "lucide-react";
import { formatAmount } from "@/lib/utils";
import { type Domain } from "@/lib/domain-colors";
import { ModuleCard, SegmentBar } from "@/components/home/module-card";
import { useDailyTotals } from "@/hooks/use-daily-totals";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { FoodSection } from "@/components/food-salt/food-section";
import { overTargetText, type MetricTotals } from "@intake/core/daily-totals";

export function FoodSaltCard() {
  const totals = useDailyTotals();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");

  return (
    <ModuleCard domain="sodium" icon={Utensils} title="Food" data-testid="food-card">
      <NutrientRow
        testId="food-card-sodium"
        label="Sodium"
        unit="mg"
        totals={totals.metrics.sodium}
        domain="sodium"
        ariaLabel="Sodium intake today, as a percentage of the daily limit"
      />

      {/* Sugar — optional tracker */}
      {sugarEnabled && (
        <NutrientRow
          testId="food-card-sugar"
          label="Sugar"
          unit="g"
          totals={totals.metrics.sugar}
          domain="sugar"
          ariaLabel="Sugar intake today, as a percentage of the daily limit"
        />
      )}

      {/* Potassium — soft target (a minimum), optional tracker */}
      {potassiumEnabled && (
        <NutrientRow
          testId="food-card-potassium"
          label="Potassium"
          unit="mg"
          totals={totals.metrics.potassium}
          ariaLabel="Potassium intake today, as a percentage of the daily target"
        />
      )}

      <FoodSection />
    </ModuleCard>
  );
}

/** A nutrient's total against its target, with the level bar (prototype `.nut`). */
function NutrientRow({
  testId,
  label,
  unit,
  totals,
  domain,
  ariaLabel,
}: {
  testId?: string;
  label: string;
  unit: string;
  totals: MetricTotals;
  domain?: Domain;
  ariaLabel: string;
}) {
  const day = totals.today;
  const { value: total, limit, buffer, soft } = day;
  const statusClass =
    soft || day.status === "none" ? undefined : progressStatusTextClass(day.status, "");
  // Past the target: how far into the buffer, against its size (#309).
  const over = overTargetText(day, (v) => formatAmount(v, unit));
  return (
    <div className="wc-nut" data-testid={testId}>
      <span className="nl">{label}</span>
      <span className="nv">
        <b className={statusClass}>{formatAmount(total, unit)}</b> / {formatAmount(limit, unit)}
      </span>
      {soft ? (
        <SegmentBar value={Math.min(total, limit)} limit={limit} aria-label={ariaLabel} />
      ) : (
        <SegmentBar value={total} limit={limit} buffer={buffer} domain={domain} aria-label={ariaLabel} />
      )}
      <span className="ns">
        {over && (
          <span className={statusClass}>
            {over}
            {" · "}
          </span>
        )}
        24h {formatAmount(totals.rolling24h, unit)}
      </span>
    </div>
  );
}
