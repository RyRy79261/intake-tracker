"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useSyncLiquidGroup, fetchEntryGroup } from "@/hooks/use-composable-entry";
import { cn, formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { formatTimeOnly } from "@/lib/date-utils";
import { type IntakeRecord, type SubstanceRecord } from "@/lib/db";

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

  const { toast } = useToast();
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const syncLiquidGroupMutation = useSyncLiquidGroup();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Water entry removed"
  );

  const [editAmount, setEditAmount] = useState("");
  const [editBeverageName, setEditBeverageName] = useState("");
  const [showBeverageNameField, setShowBeverageNameField] = useState(false);
  const [editSubstance, setEditSubstance] = useState<{
    type: "caffeine" | "alcohol";
    description: string;
  } | null>(null);
  const [editSubstanceAmount, setEditSubstanceAmount] = useState("");

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
      setEditAmount(record.amount.toString());
      setEditBeverageName("");
      setShowBeverageNameField(false);
      setEditSubstance(null);
      setEditSubstanceAmount("");

      const source = record.source ?? "";
      if (source.startsWith("beverage:")) {
        setShowBeverageNameField(true);
        setEditBeverageName(source.slice("beverage:".length));
      } else if (source === "beverage") {
        setShowBeverageNameField(true);
      }

      if (record.groupId) {
        void fetchEntryGroup(record.groupId).then((group) => {
          if (!group) return;
          const substance = group.substances.find(
            (s): s is SubstanceRecord =>
              s.type === "caffeine" || s.type === "alcohol",
          );
          if (!substance) return;
          setEditSubstance({
            type: substance.type,
            description: substance.description,
          });
          setEditBeverageName(substance.description);
          setShowBeverageNameField(true);
          if (substance.type === "caffeine" && substance.amountMg !== undefined) {
            setEditSubstanceAmount(substance.amountMg.toString());
          } else if (
            substance.type === "alcohol" &&
            substance.amountStandardDrinks !== undefined
          ) {
            setEditSubstanceAmount(substance.amountStandardDrinks.toString());
          }
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
      // Update source for beverage rename (only when no substance group is involved)
      if (showBeverageNameField && !editSubstance) {
        const trimmed = editBeverageName.trim();
        updates.source = trimmed ? `beverage:${trimmed}` : "beverage";
      }
      return updates;
    },
    mutateAsync: async ({ id, updates }) => {
      await updateMutation.mutateAsync({ id, updates });
      // Sync linked substance records when editing a coffee/alcohol entry
      if (editingRecord?.groupId && editSubstance) {
        const u = updates as { amount: number; timestamp: number };
        const substanceAmount = editSubstanceAmount
          ? parseFloat(editSubstanceAmount)
          : 0;
        await syncLiquidGroupMutation(editingRecord.groupId, {
          timestamp: u.timestamp,
          description: editBeverageName.trim() || editSubstance.description,
          volumeMl: u.amount,
          ...(editSubstance.type === "caffeine" && {
            amountMg: substanceAmount > 0 ? Math.round(substanceAmount) : 0,
          }),
          ...(editSubstance.type === "alcohol" && {
            amountStandardDrinks:
              substanceAmount > 0 ? parseFloat(substanceAmount.toFixed(2)) : 0,
          }),
        });
      }
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
        `bg-gradient-to-br ${theme.gradient} ${theme.border}`
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
            <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit} buttonClassName={CARD_THEMES.water.buttonBg}>
              <Input type="number" placeholder="Amount (ml)" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-sm" />
              {showBeverageNameField && (
                <Input
                  type="text"
                  placeholder="Beverage name"
                  value={editBeverageName}
                  onChange={(e) => setEditBeverageName(e.target.value)}
                  className="h-8 text-sm"
                />
              )}
              {editSubstance && (
                <Input
                  type="number"
                  min="0"
                  step={editSubstance.type === "alcohol" ? "0.1" : "1"}
                  placeholder={
                    editSubstance.type === "caffeine"
                      ? "Caffeine (mg)"
                      : "Alcohol (std drinks)"
                  }
                  value={editSubstanceAmount}
                  onChange={(e) => setEditSubstanceAmount(e.target.value)}
                  className="h-8 text-sm"
                />
              )}
            </InlineEditFormShell>
          )}
        />
      </CardContent>
    </Card>
  );
}
