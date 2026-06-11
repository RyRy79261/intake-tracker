"use client";

import { useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD_THEMES } from "@/lib/card-themes";
import { Droplets, Coffee, Wine } from "lucide-react";
import { WaterTab } from "@/components/liquids/water-tab";
import { BeverageTab } from "@/components/liquids/beverage-tab";
import { PresetTab } from "@/components/liquids/preset-tab";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import {
  useIntake,
  useRecentIntakeRecords,
  useDeleteIntake,
  useUpdateIntake,
  useSugarTotalsByGroupIds,
} from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useSyncLiquidEntrySubstances, fetchEntryGroup } from "@/hooks/use-composable-entry";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { cn, formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { formatTimeOnly } from "@/lib/date-utils";
import { type IntakeRecord } from "@/lib/db";
import { abvFromStandardDrinks } from "@/lib/alcohol-units";

const TAB_THEMES = {
  water: CARD_THEMES.water,
  beverage: CARD_THEMES.water,
  coffee: CARD_THEMES.caffeine,
  alcohol: CARD_THEMES.alcohol,
} as const;

type TabKey = keyof typeof TAB_THEMES;

const TAB_ICONS = {
  water: Droplets,
  beverage: Droplets,
  coffee: Coffee,
  alcohol: Wine,
} as const;

export function LiquidsCard() {
  const [activeTab, setActiveTab] = useState<string>("water");
  const waterIntake = useIntake("water");
  const settings = useSettings();
  const recentRecords = useRecentIntakeRecords("water");

  // Sugar logged alongside a drink is stored as a linked sugar intake record;
  // look it up by groupId so recent entries can show it.
  const groupIds = useMemo(
    () =>
      (recentRecords || [])
        .map((r) => r.groupId)
        .filter((id): id is string => !!id),
    [recentRecords]
  );
  const groupSugarMap = useSugarTotalsByGroupIds(groupIds);

  const { toast } = useToast();
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const syncLiquidSubstancesMutation = useSyncLiquidEntrySubstances();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Water entry removed"
  );

  const [editAmount, setEditAmount] = useState("");
  const [editBeverageName, setEditBeverageName] = useState("");
  const [editCaffeineMg, setEditCaffeineMg] = useState("");
  const [editAlcoholAbv, setEditAlcoholAbv] = useState("");
  const [editSugarG, setEditSugarG] = useState("");
  // Token to discard stale fetchEntryGroup results when opening another record
  const openTokenRef = useRef(0);

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<IntakeRecord>({
    onOpen: (record) => {
      const token = ++openTokenRef.current;
      setEditAmount(record.amount.toString());
      setEditBeverageName("");
      setEditCaffeineMg("");
      setEditAlcoholAbv("");
      setEditSugarG("");

      const source = record.source ?? "";
      if (source.startsWith("beverage:")) {
        setEditBeverageName(source.slice("beverage:".length));
      } else if (source.startsWith("preset:")) {
        // Coffee/alcohol entries reference a preset by id. Look up the
        // preset synchronously so the substance values pre-fill even if the
        // entry has no groupId (older records pre-v15) or fetchEntryGroup
        // is slow. The async path below overrides with actual stored values.
        const presetId = source.slice("preset:".length);
        const preset = settings.liquidPresets.find((p) => p.id === presetId);
        if (preset) {
          setEditBeverageName(preset.name);
          if (preset.caffeinePer100ml !== undefined && preset.caffeinePer100ml > 0) {
            const mg = Math.round((record.amount / 100) * preset.caffeinePer100ml);
            setEditCaffeineMg(mg.toString());
          }
          if (preset.alcoholPer100ml !== undefined && preset.alcoholPer100ml > 0) {
            setEditAlcoholAbv(preset.alcoholPer100ml.toString());
          }
        }
      }

      if (record.groupId) {
        void fetchEntryGroup(record.groupId).then((group) => {
          if (token !== openTokenRef.current) return;
          if (!group) return;
          const caffeine = group.substances.find(
            (s) => s.type === "caffeine" && s.deletedAt === null,
          );
          const alcohol = group.substances.find(
            (s) => s.type === "alcohol" && s.deletedAt === null,
          );
          const sugar = group.intakes.find(
            (i) => i.type === "sugar" && i.deletedAt === null,
          );
          if (caffeine?.description) setEditBeverageName(caffeine.description);
          else if (alcohol?.description) setEditBeverageName(alcohol.description);
          if (caffeine?.amountMg !== undefined) {
            setEditCaffeineMg(caffeine.amountMg.toString());
          }
          if (alcohol) {
            // Prefer the stored ABV %; fall back to deriving it from the
            // legacy std-drinks value and the entry's volume for old records.
            let abv = alcohol.abvPercent;
            if (abv === undefined && alcohol.amountStandardDrinks !== undefined) {
              const vol = alcohol.volumeMl ?? record.amount;
              if (vol > 0) {
                const derived = abvFromStandardDrinks(
                  alcohol.amountStandardDrinks,
                  vol,
                );
                if (Number.isFinite(derived)) abv = derived;
              }
            }
            if (abv !== undefined) {
              setEditAlcoholAbv(parseFloat(abv.toFixed(1)).toString());
            }
          }
          if (sugar) setEditSugarG(sugar.amount.toString());
        });
      }
    },
    buildUpdates: (timestamp, note) => {
      const newAmount = parseInt(editAmount, 10);
      if (isNaN(newAmount) || newAmount <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return null;
      }
      const updates: { amount: number; timestamp: number; note: string | undefined; source?: string } = {
        amount: newAmount,
        timestamp,
        note,
      };
      // Keep the displayed beverage name in sync for plain beverage entries
      // (source `beverage:<name>`). For preset / substance-linked entries
      // the user-facing name lives on SubstanceRecord.description and is
      // synced separately below.
      const source = editingRecord?.source ?? "";
      if (source.startsWith("beverage:") || source === "beverage") {
        const trimmed = editBeverageName.trim();
        updates.source = trimmed ? `beverage:${trimmed}` : "beverage";
      }
      return updates;
    },
    mutateAsync: async ({ id, updates }) => {
      await updateMutation.mutateAsync({ id, updates });
      const u = updates as { amount: number; timestamp: number };
      const parse = (raw: string): number | null => {
        const trimmed = raw.trim();
        if (trimmed === "") return 0; // user cleared → soft-delete any existing
        const n = parseFloat(trimmed);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const caffeineMg = parse(editCaffeineMg);
      const alcoholAbv = parse(editAlcoholAbv);
      const sugarG = sugarEnabled ? parse(editSugarG) : null;
      await syncLiquidSubstancesMutation(id, {
        timestamp: u.timestamp,
        volumeMl: u.amount,
        ...(editBeverageName.trim() && { description: editBeverageName.trim() }),
        caffeineMg,
        alcoholAbv,
        sugarG,
      });
    },
  });

  const theme = TAB_THEMES[activeTab as TabKey] ?? TAB_THEMES.water;
  const Icon = TAB_ICONS[activeTab as TabKey] ?? TAB_ICONS.water;

  const isOverLimit =
    settings.waterLimit > 0 && waterIntake.dailyTotal > settings.waterLimit;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        `bg-linear-to-br ${theme.gradient} ${theme.border}`
      )}
    >
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", theme.iconBg)}>
              <Icon className={cn("w-5 h-5", theme.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              Liquids
            </span>
          </div>

          {/* Right side header content - water stats on all tabs */}
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-medium",
                isOverLimit
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              )}
            >
              {formatAmount(waterIntake.dailyTotal, "ml")} /{" "}
              {formatAmount(settings.waterLimit, "ml")}
            </p>
            <p className="text-xs text-muted-foreground">today</p>
            <p className="text-xs text-muted-foreground/70">
              24h: {formatAmount(waterIntake.rollingTotal, "ml")}
            </p>
          </div>
        </div>

        {/* Tab Strip */}
        <Tabs
          defaultValue="water"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="water" className="text-xs">
              Water
            </TabsTrigger>
            <TabsTrigger value="beverage" className="text-xs">
              Beverage
            </TabsTrigger>
            <TabsTrigger value="coffee" className="text-xs">
              Coffee
            </TabsTrigger>
            <TabsTrigger value="alcohol" className="text-xs">
              Alcohol
            </TabsTrigger>
          </TabsList>

          {/* Water Tab */}
          <TabsContent
            value="water"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <WaterTab />
          </TabsContent>

          {/* Beverage Tab */}
          <TabsContent
            value="beverage"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <BeverageTab />
          </TabsContent>

          {/* Coffee Tab */}
          <TabsContent
            value="coffee"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <PresetTab tab="coffee" />
          </TabsContent>

          {/* Alcohol Tab */}
          <TabsContent
            value="alcohol"
            forceMount
            className="data-[state=inactive]:hidden mt-4"
          >
            <PresetTab tab="alcohol" />
          </TabsContent>
        </Tabs>

        {/* Recent water entries - always visible regardless of active tab */}
        <RecentEntriesList
          records={recentRecords}
          deletingId={deletingId}
          onDelete={handleDelete}
          onEdit={openEdit}
          editingId={editingRecord?.id ?? null}
          borderColor={CARD_THEMES.water.border}
          renderEntry={(record) => {
            const sourceLabel = getLiquidTypeLabel(record.source, { presets: settings.liquidPresets, note: record.note });
            return (
              <>
                <span className="text-muted-foreground">
                  {formatTimeOnly(record.timestamp)}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium shrink-0">
                    {formatAmount(record.amount, "ml")}
                  </span>
                  {record.groupId && groupSugarMap.get(record.groupId) ? (
                    <span className="text-xs font-medium text-pink-600 dark:text-pink-400 shrink-0">
                      {groupSugarMap.get(record.groupId)}g sugar
                    </span>
                  ) : null}
                  {sourceLabel && (
                    <span className="text-xs text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded truncate">
                      {sourceLabel}
                    </span>
                  )}
                </div>
              </>
            );
          }}
          renderEditForm={() => (
            <InlineEditFormShell
              timestamp={editTimestamp}
              onTimestampChange={setEditTimestamp}
              note={editNote}
              onNoteChange={setEditNote}
              onSave={() => handleEditSubmit()}
              onCancel={closeEdit}
              buttonClassName={CARD_THEMES.water.buttonBg}
              labeled
              idPrefix="edit-liquid"
            >
              <div className="space-y-1">
                <Label htmlFor="edit-liquid-amount" className="text-xs text-muted-foreground">Amount (ml)</Label>
                <Input id="edit-liquid-amount" type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-liquid-beverage" className="text-xs text-muted-foreground">
                  Beverage name <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-liquid-beverage"
                  type="text"
                  value={editBeverageName}
                  onChange={(e) => setEditBeverageName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-liquid-caffeine" className="text-xs text-muted-foreground">
                  Caffeine (mg) <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-liquid-caffeine"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={editCaffeineMg}
                  onChange={(e) => setEditCaffeineMg(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-liquid-alcohol" className="text-xs text-muted-foreground">
                  Alcohol (% ABV) <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-liquid-alcohol"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={editAlcoholAbv}
                  onChange={(e) => setEditAlcoholAbv(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              {sugarEnabled && (
                <div className="space-y-1">
                  <Label htmlFor="edit-liquid-sugar" className="text-xs text-muted-foreground">
                    Sugar (g) <span className="font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="edit-liquid-sugar"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={editSugarG}
                    onChange={(e) => setEditSugarG(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </InlineEditFormShell>
          )}
        />
      </CardContent>
    </Card>
  );
}
