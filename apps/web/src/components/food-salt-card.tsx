"use client";

import { progressStatusTextClass } from "@intake/ui/progress";
import { Utensils } from "lucide-react";
import { formatAmount } from "@/lib/utils";
import { type Domain } from "@/lib/domain-colors";
import { ModuleCard, SegmentBar } from "@/components/home/module-card";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { FoodSection } from "@/components/food-salt/food-section";
import { computeTwoStageProgress, type TwoStageProgress } from "@intake/core/progress";

export function FoodSaltCard() {
  const saltIntake = useIntake("salt");
  const sugarIntake = useIntake("sugar");
  const potassiumIntake = useIntake("potassium");
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const settings = useSettings();
  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const saltProgress = computeTwoStageProgress(
    dailyTotal,
    limit,
    settings.saltExtendedBuffer
  );

  const sugarDaily = sugarIntake.dailyTotal;
  const sugarRolling = sugarIntake.rollingTotal;
  const sugarLimit = settings.sugarLimit;
  const sugarProgress = computeTwoStageProgress(
    sugarDaily,
    sugarLimit,
    settings.sugarExtendedBuffer
  );

  const potassiumDaily = potassiumIntake.dailyTotal;
  const potassiumRolling = potassiumIntake.rollingTotal;
  const potassiumLimit = settings.potassiumLimit;

  return (
    <ModuleCard domain="sodium" icon={Utensils} title="Food" data-testid="food-card">
      <NutrientRow
        testId="food-card-sodium"
        label="Sodium"
        unit="mg"
        total={dailyTotal}
        limit={limit}
        buffer={settings.saltExtendedBuffer}
        rolling={rollingTotal}
        progress={saltProgress}
        domain="sodium"
        ariaLabel="Sodium intake today, as a percentage of the daily limit"
      />

      {/* Sugar — optional tracker */}
      {sugarEnabled && (
        <NutrientRow
          testId="food-card-sugar"
          label="Sugar"
          unit="g"
          total={sugarDaily}
          limit={sugarLimit}
          buffer={settings.sugarExtendedBuffer}
          rolling={sugarRolling}
          progress={sugarProgress}
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
          total={potassiumDaily}
          limit={potassiumLimit}
          rolling={potassiumRolling}
          soft
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
  total,
  limit,
  buffer = 0,
  rolling,
  progress,
  domain,
  soft = false,
  ariaLabel,
}: {
  testId?: string;
  label: string;
  unit: string;
  total: number;
  limit: number;
  buffer?: number;
  rolling: number;
  progress?: TwoStageProgress;
  domain?: Domain;
  soft?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="wc-nut" data-testid={testId}>
      <span className="nl">{label}</span>
      <span className="nv">
        <b className={progress ? progressStatusTextClass(progress.status, "") : undefined}>
          {formatAmount(total, unit)}
        </b>{" "}
        / {formatAmount(limit, unit)}
      </span>
      {soft ? (
        <SegmentBar value={Math.min(total, limit)} limit={limit} aria-label={ariaLabel} />
      ) : (
        <SegmentBar value={total} limit={limit} buffer={buffer} domain={domain} aria-label={ariaLabel} />
      )}
      <span className="ns">
        {progress?.isOverTarget && (
          <span className={progressStatusTextClass(progress.status, "")}>
            {progress.extendedTotal > 0 ? (
              <>
                {formatAmount(progress.extendedCurrent, unit)} /{" "}
                {formatAmount(progress.extendedTotal, unit)} extra
              </>
            ) : (
              <>{formatAmount(progress.extendedCurrent, unit)} over</>
            )}
            {" · "}
          </span>
        )}
        24h {formatAmount(rolling, unit)}
      </span>
    </div>
  );
}
