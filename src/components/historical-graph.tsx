"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Droplets, Scale, Heart } from "lucide-react";
import { useGraphData, type GraphScope } from "@/hooks/use-graph-data";
import { useSettings } from "@/hooks/use-settings";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { IntakeChart } from "./charts/intake-chart";
import { WeightChart } from "./charts/weight-chart";
import { BPChart } from "./charts/bp-chart";
import { MetricsSection } from "./charts/metrics-section";

type ViewType = "intake" | "weight" | "bp";

const VIEW_ACTIVE_COLORS: Record<ViewType, string> = {
  intake: "bg-green-600 hover:bg-green-700 text-white",
  weight: "bg-emerald-600 hover:bg-emerald-700 text-white",
  bp: "bg-rose-600 hover:bg-rose-700 text-white",
};

const VIEW_OPTIONS: { value: ViewType; label: string; icon: React.ReactNode }[] = [
  { value: "intake", label: "Intake", icon: <Droplets className="w-3.5 h-3.5" /> },
  { value: "weight", label: "Weight", icon: <Scale className="w-3.5 h-3.5" /> },
  { value: "bp", label: "BP", icon: <Heart className="w-3.5 h-3.5" /> },
];

export function HistoricalGraph() {
  const [view, setView] = useState<ViewType>("intake");
  const [scope, setScope] = useState<GraphScope>("24h");
  const data = useGraphData(scope);
  const isLoading = data === undefined;
  const settings = useSettings();
  const now = useNow(60_000);

  return (
    <Card className="overflow-hidden bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-2 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              <BarChart3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <CardTitle className="text-base">History</CardTitle>
          </div>
          <div className="flex gap-1">
            {VIEW_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  view === opt.value
                    ? cn(VIEW_ACTIVE_COLORS[opt.value], "shadow-sm")
                    : "text-muted-foreground"
                )}
                onClick={() => setView(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <Tabs value={scope} onValueChange={(v) => setScope(v as GraphScope)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="24h" className="text-xs">24 hours</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">Week</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">Month</TabsTrigger>
          </TabsList>
          <TabsContent value={scope} className="mt-2">
            {isLoading && (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            {data && !isLoading && view === "intake" && (
              <IntakeChart data={data} waterLimit={settings.waterLimit} saltLimit={settings.saltLimit} now={now} />
            )}
            {data && !isLoading && view === "weight" && (
              <WeightChart data={data} now={now} />
            )}
            {data && !isLoading && view === "bp" && (
              <BPChart data={data} now={now} />
            )}
          </TabsContent>
        </Tabs>
        {data && <MetricsSection data={data} />}
      </CardContent>
    </Card>
  );
}
