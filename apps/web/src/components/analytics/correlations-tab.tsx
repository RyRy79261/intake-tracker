"use client";

import { useId, useState, type CSSProperties } from "react";
import { Button } from "@intake/ui/button";
import { BarChart3, ArrowRightLeft } from "lucide-react";
import {
  useSaltVsWeight,
  useSugarVsWeight,
  usePotassiumVsWeight,
  useCaffeineVsBP,
  useAlcoholVsBP,
  useCorrelation,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import type { TimeRange, Domain, CorrelationResult, AnalyticsResult } from "@intake/types/analytics";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { CorrelationChart } from "@/components/analytics/correlation-chart";
import {
  AXIS_PROPS,
  CHART_COLOR,
  GRID_PROPS,
  TOOLTIP_PROPS,
} from "@/components/analytics/chart-theme";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Domain options for custom comparison
// ---------------------------------------------------------------------------

// Medication is intentionally excluded — medication-domain analytics are a
// separate refactor (it has no single numeric series today). Optional-
// tracker entries (sugar, potassium) are filtered out at render time when
// the tracker is disabled in settings.
interface DomainOption {
  value: Domain;
  label: string;
  /** Optional-tracker key gating the visibility of this option. */
  optional?: "sugar" | "potassium";
}
const DOMAIN_OPTIONS: DomainOption[] = [
  { value: "water", label: "Water Intake" },
  { value: "salt", label: "Sodium Intake" },
  { value: "sugar", label: "Sugar Intake", optional: "sugar" },
  { value: "potassium", label: "Potassium Intake", optional: "potassium" },
  { value: "weight", label: "Weight" },
  { value: "bp", label: "Blood Pressure" },
  { value: "eating", label: "Eating" },
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "caffeine", label: "Caffeine" },
  { value: "alcohol", label: "Alcohol" },
];

const DOMAIN_UNITS: Record<Domain, string> = {
  water: " ml",
  salt: " mg",
  sugar: " g",
  potassium: " mg",
  weight: " kg",
  bp: " mmHg",
  eating: "",
  urination: " ml",
  defecation: "",
  caffeine: " mg",
  alcohol: " drinks",
  medication: "",
};

// ---------------------------------------------------------------------------
// Interpretation helper
// ---------------------------------------------------------------------------

function interpretCorrelation(result: CorrelationResult): string {
  const { coefficient, strength, pairedDays } = result;
  if (pairedDays < 3) {
    return "Not enough overlapping days in this period to assess a relationship.";
  }
  if (strength === "none") return "No meaningful relationship detected in this period.";
  const direction = coefficient > 0 ? "increase together" : "move in opposite directions";
  const qualifier =
    strength === "strong" ? "clearly" : strength === "moderate" ? "tend to" : "slightly";
  return `These measures ${qualifier} ${direction} (r=${coefficient.toFixed(2)}).`;
}


// ---------------------------------------------------------------------------
// Correlation card
// ---------------------------------------------------------------------------

function CorrelationCard({
  title,
  result,
  labelA,
  labelB,
  unitA,
  unitB,
}: {
  title: string;
  result: AnalyticsResult<CorrelationResult>;
  labelA: string;
  labelB: string;
  unitA: string;
  unitB: string;
}) {
  return (
    <section className="wm-card">
      <h3 className="wm-ct">{title}</h3>
      <CorrelationChart
        result={result.value}
        labelA={labelA}
        labelB={labelB}
        unitA={unitA}
        unitB={unitB}
      />
      <p className="wm-p mt-1">{interpretCorrelation(result.value)}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fluid balance card
// ---------------------------------------------------------------------------

// Fluid balance target: ml of intake above estimated output per day.
const FLUID_TARGET_ML = 500;

const WATER_C = { "--c": CHART_COLOR.water } as CSSProperties;

function FluidBalanceCard({ range }: { range: TimeRange }) {
  const data = useFluidBalance(range);

  if (!data || data.value.daily.length === 0) {
    return (
      <section className="wm-card" style={WATER_C}>
        <h3 className="wm-ct">Fluid Balance</h3>
        <div className="wm-nodata h-[200px]">No fluid data for this period</div>
      </section>
    );
  }

  const barData = data.value.daily.map((d) => ({
    date: d.date,
    balance: d.balance,
    target: d.target,
  }));

  return (
    <section className="wm-card" style={WATER_C}>
      <h3 className="wm-ct">Fluid Balance</h3>
      <div className="wm-chart">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="date" {...AXIS_PROPS} />
            <YAxis
              {...AXIS_PROPS}
              axisLine={false}
              tickFormatter={(v: number) => `${v}ml`}
            />
            <Tooltip
              {...TOOLTIP_PROPS}
              formatter={(v) => [`${Math.round(Number(v))} ml`, "Balance"]}
            />
            <ReferenceLine y={0} stroke={CHART_COLOR.line} />
            <ReferenceLine
              y={FLUID_TARGET_ML}
              stroke={CHART_COLOR.weight}
              strokeDasharray="4 4"
              label={{
                value: `Target +${FLUID_TARGET_ML}ml`,
                position: "insideTopRight",
                fontSize: 9,
                fill: CHART_COLOR.weight,
              }}
            />
            <Bar
              dataKey="balance"
              name="Balance"
              fill={CHART_COLOR.water}
              radius={0}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="wm-stats justify-between">
        <span>
          Avg: <b className="num font-medium">{Math.round(data.value.avgBalance)} ml/day</b>
        </span>
        <span className="text-muted-foreground">
          {data.value.daysAboveTarget}/{data.value.daysTotal} days on target
        </span>
      </div>
      <p className="wm-note">
        Balance = water intake − estimated urination output. Output is
        estimated from logged amount categories.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Custom comparison
// ---------------------------------------------------------------------------

function CustomComparison({ range }: { range: TimeRange }) {
  const lagId = useId();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const visibleOptions = DOMAIN_OPTIONS.filter(
    (o) =>
      !o.optional ||
      (o.optional === "sugar" && sugarEnabled) ||
      (o.optional === "potassium" && potassiumEnabled),
  );
  const [domainA, setDomainA] = useState<Domain>("salt");
  const [domainB, setDomainB] = useState<Domain>("weight");
  const [lagDays, setLagDays] = useState(0);
  const [active, setActive] = useState(false);

  // Only run the query when user clicks Compare
  const correlationData = useCorrelation(
    active ? domainA : "water",
    active ? domainB : "water",
    active ? range : { start: 0, end: 0 },
    active ? lagDays : undefined,
  );

  const domainLabel = (d: Domain) =>
    DOMAIN_OPTIONS.find((o) => o.value === d)?.label ?? d;

  const select = (value: Domain, onChange: (d: Domain) => void, label: string) => (
    <select
      className="wm-field"
      aria-label={label}
      value={value}
      onChange={(e) => {
        onChange(e.target.value as Domain);
        setActive(false);
      }}
    >
      {visibleOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className="wm-card" data-testid="custom-comparison">
      <div className="wm-cc">
        {select(domainA, setDomainA, "First measure")}
        <span className="text-muted-foreground">vs</span>
        {select(domainB, setDomainB, "Second measure")}
      </div>
      <div className="wm-lag">
        <label htmlFor={lagId}>Lag (days):</label>
        <input
          id={lagId}
          type="number"
          inputMode="numeric"
          min={0}
          max={14}
          step={1}
          value={lagDays}
          onChange={(e) => {
            setLagDays(Number(e.target.value));
            setActive(false);
          }}
          className="wm-field"
        />
        <Button onClick={() => setActive(true)}>Compare</Button>
      </div>

      {active && correlationData && (
        <div className="mt-3">
          <h4 className="wm-ct">
            {domainLabel(domainA)} vs {domainLabel(domainB)}
          </h4>
          <CorrelationChart
            result={correlationData.value}
            labelA={domainLabel(domainA)}
            labelB={domainLabel(domainB)}
            unitA={DOMAIN_UNITS[domainA]}
            unitB={DOMAIN_UNITS[domainB]}
          />
          <p className="wm-p mt-1">{interpretCorrelation(correlationData.value)}</p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

export function CorrelationsTab({ range }: { range: TimeRange }) {
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const saltVsWeight = useSaltVsWeight(range);
  const sugarVsWeight = useSugarVsWeight(range);
  const potassiumVsWeight = usePotassiumVsWeight(range);
  const caffeineVsBP = useCaffeineVsBP(range);
  const alcoholVsBP = useAlcoholVsBP(range);

  return (
    <>
      <h3 className="wm-h">
        <BarChart3 aria-hidden="true" />
        Pre-configured Correlations
      </h3>

      <CorrelationCard
        title="Weight vs Sodium Intake"
        result={saltVsWeight}
        labelA="Sodium"
        labelB="Weight"
        unitA=" mg"
        unitB=" kg"
      />

      {sugarEnabled && (
        <CorrelationCard
          title="Weight vs Sugar Intake"
          result={sugarVsWeight}
          labelA="Sugar"
          labelB="Weight"
          unitA=" g"
          unitB=" kg"
        />
      )}

      {potassiumEnabled && (
        <CorrelationCard
          title="Weight vs Potassium Intake"
          result={potassiumVsWeight}
          labelA="Potassium"
          labelB="Weight"
          unitA=" mg"
          unitB=" kg"
        />
      )}

      <CorrelationCard
        title="Caffeine vs Blood Pressure"
        result={caffeineVsBP}
        labelA="Caffeine"
        labelB="Systolic BP"
        unitA=" mg"
        unitB=" mmHg"
      />

      <CorrelationCard
        title="Alcohol vs Blood Pressure"
        result={alcoholVsBP}
        labelA="Alcohol"
        labelB="Systolic BP"
        unitA=" units"
        unitB=" mmHg"
      />

      {/* Fluid balance overview */}
      <FluidBalanceCard range={range} />

      {/* Custom comparison section */}
      <h3 className="wm-h">
        <ArrowRightLeft aria-hidden="true" />
        Custom Comparison
      </h3>

      <CustomComparison range={range} />
    </>
  );
}
