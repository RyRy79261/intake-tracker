"use client";

import type { CSSProperties } from "react";
import { CupSoda } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { formatHour } from "@intake/core/settings";
import { useSettingsStore } from "@/stores/settings-store";
import { OPTIONAL_TRACKERS } from "@/lib/optional-trackers";
import { DEFAULT_WEEK_STARTS_ON, weekDayOrder } from "@/lib/date-utils";
import { domainColor, type Domain } from "@/lib/domain-colors";
import {
  Seg,
  SetRow,
  SubHead,
  Tog,
  UnitNumberField,
  flabelClass,
  helpClass,
} from "@/components/settings/settings-kit";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Every weekday, the default (Monday) first. 0 = Sunday, JS getDay numbering. */
const WEEK_START_OPTIONS = weekDayOrder(DEFAULT_WEEK_STARTS_ON);

const AMOUNTS = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
] as const;

const read = () => useSettingsStore.getState();

/** "Records before 2 am count toward the previous day." */
function dayStartHelp(hour: number): string {
  if (hour === 0) return "Days start at midnight.";
  const h12 = hour % 12 || 12;
  const ap = hour < 12 ? "am" : "pm";
  return `Records before ${h12} ${ap} count toward the previous day.`;
}

interface LimitRowProps {
  label: string;
  /** The tracked domain, for the colour pip. Potassium has none. */
  domain?: Domain;
  unit: string;
  limit: number;
  limitMin: number;
  limitMax: number;
  setLimit: (v: number) => void;
  readLimit: () => number;
  buffer?: {
    value: number;
    max: number;
    set: (v: number) => void;
    read: () => number;
  };
}

/** One `.lim` row: domain pip + label, target, "+", buffer. */
function LimitRow({ label, domain, unit, limit, limitMin, limitMax, setLimit, readLimit, buffer }: LimitRowProps) {
  return (
    <div className="grid grid-cols-[6.5em_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 text-sm">
      <span className="flex h-9 items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 bg-[color:var(--c,hsl(var(--muted-fg)))]"
          style={domain ? ({ "--c": domainColor(domain) } as CSSProperties) : undefined}
        />
        {label}
      </span>
      <UnitNumberField
        label={`${label} daily ${buffer ? "limit" : "target"} (${unit})`}
        unit={unit}
        value={limit}
        min={limitMin}
        max={limitMax}
        onSave={setLimit}
        readStored={readLimit}
        compact
      />
      {buffer ? (
        <>
          <span aria-hidden="true" className="flex h-9 items-center font-mono text-muted-foreground">
            +
          </span>
          <UnitNumberField
            label={`${label} buffer (${unit})`}
            unit={unit}
            value={buffer.value}
            min={0}
            max={buffer.max}
            onSave={buffer.set}
            readStored={buffer.read}
            compact
          />
        </>
      ) : (
        <span className="col-span-2 flex h-9 items-center text-[0.8125rem] text-muted-foreground">
          target only
        </span>
      )}
    </div>
  );
}

/**
 * Settings › Tracking: day and week start, the daily limits as target +
 * buffer, optional trackers, the +/- steps, bathroom defaults, and the link
 * to the Drink presets page. Every value here is the one the store already
 * holds (the synced keys are unchanged).
 */
export function TrackingSettingsSection({ onOpenPresets }: { onOpenPresets: () => void }) {
  const s = useSettingsStore();
  const presets = s.liquidPresets;
  const cats = [
    ...new Set(
      presets.map((p) => ({ coffee: "Coffee", alcohol: "Alcohol", beverage: "Beverage" })[p.tab]),
    ),
  ];

  return (
    <>
      <SubHead>Day &amp; week</SubHead>
      <div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="set-day-start" className={flabelClass}>
              Day starts at
            </label>
            <Select value={s.dayStartHour.toString()} onValueChange={(v) => s.setDayStartHour(parseInt(v, 10))}>
              <SelectTrigger id="set-day-start" className="h-11 border-muted-foreground font-mono text-[0.9375rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {formatHour(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="set-week-start" className={flabelClass}>
              Week starts on
            </label>
            <Select value={s.weekStartsOn.toString()} onValueChange={(v) => s.setWeekStartsOn(parseInt(v, 10))}>
              <SelectTrigger id="set-week-start" className="h-11 border-muted-foreground text-[0.9375rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_START_OPTIONS.map((day) => (
                  <SelectItem key={day} value={day.toString()}>
                    {WEEKDAY_NAMES[day]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className={`${helpClass} mt-1.5`}>{dayStartHelp(s.dayStartHour)}</p>
      </div>

      <div role="group" aria-labelledby="set-limits-label" className="flex flex-col gap-3">
        <SubHead id="set-limits-label">Limits · target + buffer</SubHead>
        <div className="flex flex-col gap-1.5">
          <LimitRow
            label="Water"
            domain="water"
            unit="ml"
            limit={s.waterLimit}
            limitMin={100}
            limitMax={10000}
            setLimit={s.setWaterLimit}
            readLimit={() => read().waterLimit}
            buffer={{ value: s.waterExtendedBuffer, max: 10000, set: s.setWaterExtendedBuffer, read: () => read().waterExtendedBuffer }}
          />
          <LimitRow
            label="Sodium"
            domain="sodium"
            unit="mg"
            limit={s.saltLimit}
            limitMin={100}
            limitMax={10000}
            setLimit={s.setSaltLimit}
            readLimit={() => read().saltLimit}
            buffer={{ value: s.saltExtendedBuffer, max: 10000, set: s.setSaltExtendedBuffer, read: () => read().saltExtendedBuffer }}
          />
          {s.optionalTrackers.sugar && (
            <LimitRow
              label="Sugar"
              domain="sugar"
              unit="g"
              limit={s.sugarLimit}
              limitMin={5}
              limitMax={500}
              setLimit={s.setSugarLimit}
              readLimit={() => read().sugarLimit}
              buffer={{ value: s.sugarExtendedBuffer, max: 500, set: s.setSugarExtendedBuffer, read: () => read().sugarExtendedBuffer }}
            />
          )}
          {s.optionalTrackers.potassium && (
            <LimitRow
              label="Potassium"
              unit="mg"
              limit={s.potassiumLimit}
              limitMin={100}
              limitMax={20000}
              setLimit={s.setPotassiumLimit}
              readLimit={() => read().potassiumLimit}
            />
          )}
        </div>
        <p className={helpClass}>
          Past the target shows hatched; past target + buffer shows solid with ▲. A buffer of 0 turns
          the second stage off.
        </p>
      </div>

      <div role="group" aria-labelledby="set-trackers-label" className="flex flex-col gap-1.5">
        <SubHead id="set-trackers-label">Optional trackers</SubHead>
        <div>
          {OPTIONAL_TRACKERS.map(({ key, label }) => (
            <Tog
              key={key}
              id={`optional-tracker-${key}`}
              testId={`optional-tracker-row-${key}`}
              label={label}
              checked={s.optionalTrackers[key]}
              onCheckedChange={(v) => s.setOptionalTracker(key, v)}
            />
          ))}
        </div>
        <p className={helpClass}>
          Sugar logs total sugars per food entry; potassium is a rough estimate. A tracker that is
          off is hidden everywhere; what you logged is kept.
        </p>
      </div>

      <SubHead>Steps</SubHead>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="set-water-step" className={flabelClass}>
            Water step
          </label>
          <UnitNumberField
            id="set-water-step"
            label="Water step (ml)"
            unit="ml"
            value={s.waterIncrement}
            min={10}
            max={1000}
            step={10}
            onSave={s.setWaterIncrement}
            readStored={() => read().waterIncrement}
          />
        </div>
        <div>
          <label htmlFor="set-weight-step" className={flabelClass}>
            Weight step
          </label>
          <UnitNumberField
            id="set-weight-step"
            label="Weight step (kg)"
            unit="kg"
            value={s.weightIncrement}
            min={0.05}
            max={1}
            step={0.05}
            inputMode="decimal"
            onSave={s.setWeightIncrement}
            readStored={() => read().weightIncrement}
          />
        </div>
      </div>

      <SubHead>Bathroom defaults</SubHead>
      <div>
        <span className={flabelClass}>Urination default amount</span>
        <Seg
          label="Urination default amount"
          value={s.urinationDefaultAmount}
          options={AMOUNTS}
          onChange={s.setUrinationDefaultAmount}
          full
        />
      </div>
      <div>
        <span className={flabelClass}>Defecation default amount</span>
        <Seg
          label="Defecation default amount"
          value={s.defecationDefaultAmount}
          options={AMOUNTS}
          onChange={s.setDefecationDefaultAmount}
          full
        />
      </div>

      <SubHead>Drinks</SubHead>
      <SetRow
        icon={CupSoda}
        title="Drink presets"
        summary={`${presets.length} preset${presets.length === 1 ? "" : "s"} · ${cats.join(", ") || "none"}`}
        onClick={onOpenPresets}
      />
    </>
  );
}
