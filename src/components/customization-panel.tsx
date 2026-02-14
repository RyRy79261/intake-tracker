"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sliders } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { COFFEE_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CustomizationPanel() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Sliders className="w-4 h-4" />
          Defaults &amp; Customizations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5" />
            Defaults &amp; Customizations
          </DialogTitle>
          <DialogDescription>
            Configure default values for tracking metrics and graph display
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="tracking" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tracking" className="text-xs">Tracking</TabsTrigger>
            <TabsTrigger value="coffee" className="text-xs">Coffee</TabsTrigger>
            <TabsTrigger value="graph" className="text-xs">Graph</TabsTrigger>
          </TabsList>

          {/* Tracking Tab */}
          <TabsContent value="tracking" className="mt-4 space-y-6">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Urination default amount</Label>
                <Select
                  value={settings.urinationDefaultAmount}
                  onValueChange={(v) => settings.setUrinationDefaultAmount(v as "small" | "medium" | "large")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-selected amount when opening the urination details dialog
                </p>
              </div>
              <div className="space-y-2">
                <Label>Defecation default amount</Label>
                <Select
                  value={settings.defecationDefaultAmount}
                  onValueChange={(v) => settings.setDefecationDefaultAmount(v as "small" | "medium" | "large")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-selected amount when opening the defecation details dialog
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Coffee Tab */}
          <TabsContent value="coffee" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Default coffee type</Label>
              <div className="grid grid-cols-2 gap-2">
                {COFFEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "transition-all",
                      settings.coffeeDefaultType === preset.value &&
                        "bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700"
                    )}
                    onClick={() => settings.setCoffeeDefaultType(preset.value)}
                  >
                    {preset.label}
                    {preset.waterMl > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({preset.waterMl}ml)
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Pre-selected coffee type when opening the coffee dialog
              </p>
            </div>
          </TabsContent>

          {/* Graph Tab */}
          <TabsContent value="graph" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which reference lines appear by default on the weight chart.
              You can still toggle them on/off directly on the chart.
            </p>
            <div className="space-y-3">
              <GraphToggle
                label="Eating"
                description="Show eating event markers"
                checked={settings.weightGraphShowEating}
                onChange={settings.setWeightGraphShowEating}
                activeColor="bg-orange-100 border-orange-300 dark:bg-orange-900/50 dark:border-orange-700"
              />
              <GraphToggle
                label="Urination"
                description="Show urination event markers"
                checked={settings.weightGraphShowUrination}
                onChange={settings.setWeightGraphShowUrination}
                activeColor="bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700"
              />
              <GraphToggle
                label="Defecation"
                description="Show defecation event markers"
                checked={settings.weightGraphShowDefecation}
                onChange={settings.setWeightGraphShowDefecation}
                activeColor="bg-stone-100 border-stone-300 dark:bg-stone-900/50 dark:border-stone-700"
              />
              <GraphToggle
                label="Drinking"
                description="Show water intake markers"
                checked={settings.weightGraphShowDrinking}
                onChange={settings.setWeightGraphShowDrinking}
                activeColor="bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700"
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function GraphToggle({
  label,
  description,
  checked,
  onChange,
  activeColor,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  activeColor: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
        checked ? activeColor : "border-border bg-background"
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          "w-10 h-6 rounded-full transition-colors relative",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}
