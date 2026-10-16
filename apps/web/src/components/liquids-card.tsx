"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import { CARD_THEMES } from "@/lib/card-themes";
import { Droplets, Coffee, Wine } from "lucide-react";
import { WaterTab } from "@/components/liquids/water-tab";
import { BeverageTab } from "@/components/liquids/beverage-tab";
import { PresetTab } from "@/components/liquids/preset-tab";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import {
  useIntake,
  useRecentIntakeRecords,
  useSugarTotalsByGroupIds,
} from "@/hooks/use-intake-queries";
import { useSettings } from "@/hooks/use-settings";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useDrink } from "@/hooks/use-drink";
import { useDrinkEdit } from "@/hooks/use-drink-edit";
import { DrinkEditFields } from "@/components/liquids/drink-edit-fields";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { ModuleCard } from "@/components/home/module-card";
import { getProgressStatus } from "@intake/core/progress";
import { progressStatusTextClass } from "@intake/ui/progress";

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

  const drink = useDrink();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  // A drink's water row takes the whole drink with it; a meal's water row
  // goes on its own (see the Drink module).
  const deleteLiquid = useMemo(() => ({ mutateAsync: drink.remove }), [drink]);
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteLiquid,
    "Water entry removed",
    { undoToast: true }
  );

  const drinkEdit = useDrinkEdit();
  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = drinkEdit;

  const theme = TAB_THEMES[activeTab as TabKey] ?? TAB_THEMES.water;
  const Icon = TAB_ICONS[activeTab as TabKey] ?? TAB_ICONS.water;

  const waterStatus = getProgressStatus(
    waterIntake.dailyTotal,
    settings.waterLimit,
    settings.waterExtendedBuffer
  );

  return (
    <ModuleCard
      domain={theme.domain}
      icon={Icon}
      title="Liquids"
      data-testid="liquids-card"
      right={
        <>
          <b
            data-testid="liquids-today-total"
            className={progressStatusTextClass(waterStatus, "")}
          >
            {formatAmount(waterIntake.dailyTotal, "ml")}
          </b>{" "}
          / {formatAmount(settings.waterLimit, "ml")}
          <br />
          today · 24h {formatAmount(waterIntake.rollingTotal, "ml")}
        </>
      }
    >
        <Tabs
          defaultValue="water"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="water" className="px-1">
              Water
            </TabsTrigger>
            <TabsTrigger value="beverage" className="px-1">
              Beverage
            </TabsTrigger>
            <TabsTrigger value="coffee" className="px-1">
              Coffee
            </TabsTrigger>
            <TabsTrigger value="alcohol" className="px-1">
              Alcohol
            </TabsTrigger>
          </TabsList>

          {/* Water Tab */}
          <TabsContent
            value="water"
            forceMount
            className="data-[state=inactive]:hidden mt-3"
          >
            <WaterTab />
          </TabsContent>

          {/* Beverage Tab */}
          <TabsContent
            value="beverage"
            forceMount
            className="data-[state=inactive]:hidden mt-3"
          >
            <BeverageTab />
          </TabsContent>

          {/* Coffee Tab */}
          <TabsContent
            value="coffee"
            forceMount
            className="data-[state=inactive]:hidden mt-3"
          >
            <PresetTab tab="coffee" />
          </TabsContent>

          {/* Alcohol Tab */}
          <TabsContent
            value="alcohol"
            forceMount
            className="data-[state=inactive]:hidden mt-3"
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
          renderLabel={(record) => {
            const sourceLabel = getLiquidTypeLabel(record.source, { presets: settings.liquidPresets, note: record.note });
            const sugar = sugarEnabled && record.groupId ? groupSugarMap.get(record.groupId) : undefined;
            return (
              <>
                <span className="num">{formatAmount(record.amount, "ml")}</span>
                {sugar ? <span className="src text-sugar">{sugar}g sugar</span> : null}
                {sourceLabel && <span className="src">{sourceLabel}</span>}
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
              labeled
              idPrefix="edit-liquid"
            >
              <DrinkEditFields form={drinkEdit} />
            </InlineEditFormShell>
          )}
        />
    </ModuleCard>
  );
}
