"use client";

import { useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
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
import { useToast } from "@intake/ui/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import {
  useSyncLiquidEntrySubstances,
  useDeleteLiquidEntry,
  fetchEntryGroup,
} from "@/hooks/use-composable-entry";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { ModuleCard } from "@/components/home/module-card";
import { type IntakeRecord } from "@/lib/db";
import { abvFromStandardDrinks } from "@intake/core/alcohol";
import { getProgressStatus } from "@intake/core/progress";
import { progressStatusTextClass } from "@intake/ui/progress";
import { useFieldId } from "@/components/log-form-scope";

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
  const fid = useFieldId();
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
  // Deleting a drink's fluid row must take its caffeine/alcohol record with it;
  // deleting a meal's water-content row must not take the meal.
  const deleteLiquid = useDeleteLiquidEntry(deleteMutation.mutateAsync);
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteLiquid,
    "Water entry removed",
    { undoToast: true }
  );

  const [editAmount, setEditAmount] = useState("");
  const [editBeverageName, setEditBeverageName] = useState("");
  const [editCaffeineMg, setEditCaffeineMg] = useState("");
  const [editAlcoholAbv, setEditAlcoholAbv] = useState("");
  const [editSugarG, setEditSugarG] = useState("");
  // Token to discard stale fetchEntryGroup results when opening another record
  const openTokenRef = useRef(0);
  // Which substance fields the form actually populated for this record. An
  // empty field only means "delete this substance" when there was a value in
  // it to begin with — the group prefill below is async, so a blank field can
  // simply mean it has not resolved (or failed), and treating that as a clear
  // silently soft-deleted a live caffeine/alcohol record on save.
  const prefilledRef = useRef({ caffeine: false, alcohol: false, sugar: false });
  // A meal's water-content row also lists here. Its sugar belongs to the meal
  // and a meal takes no caffeine/alcohol, so the form only edits its amount
  // and time (the time moves the whole meal).
  const [editIsMealWater, setEditIsMealWater] = useState(false);
  // The drink name the form was filled with (from the source/preset, then
  // the stored substance description). A change to it relabels the row —
  // the Recent label is the water row's note — unless the user typed their
  // own note.
  const openedNameRef = useRef("");
  const prefillName = (name: string) => {
    openedNameRef.current = name;
    setEditBeverageName(name);
  };

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
      prefilledRef.current = { caffeine: false, alcohol: false, sugar: false };
      setEditAmount(record.amount.toString());
      prefillName("");
      setEditCaffeineMg("");
      setEditAlcoholAbv("");
      setEditSugarG("");
      setEditIsMealWater(record.source === "manual:food_water_content");

      const source = record.source ?? "";
      if (source.startsWith("beverage:")) {
        prefillName(source.slice("beverage:".length));
      } else if (source.startsWith("preset:")) {
        // Coffee/alcohol entries reference a preset by id; use it for the
        // name only. Substance values come solely from the stored records
        // below: pre-filling them from the preset's *current* values brought
        // back a caffeine/alcohol record the user had cleared, on the next
        // save of any unrelated change.
        const presetId = source.slice("preset:".length);
        const preset = settings.liquidPresets.find((p) => p.id === presetId);
        if (preset) prefillName(preset.name);
        else if (record.note) prefillName(record.note);
      }

      if (record.groupId) {
        void fetchEntryGroup(record.groupId)
          .then((group) => {
          if (token !== openTokenRef.current) return;
          if (!group) return;
          if (group.eatings.some((e) => e.deletedAt === null)) {
            setEditIsMealWater(true);
            return;
          }
          const caffeine = group.substances.find(
            (s) => s.type === "caffeine" && s.deletedAt === null,
          );
          const alcohol = group.substances.find(
            (s) => s.type === "alcohol" && s.deletedAt === null,
          );
          const sugar = group.intakes.find(
            (i) => i.type === "sugar" && i.deletedAt === null,
          );
          if (caffeine?.description) prefillName(caffeine.description);
          else if (alcohol?.description) prefillName(alcohol.description);
          if (caffeine?.amountMg !== undefined) {
            setEditCaffeineMg(caffeine.amountMg.toString());
            prefilledRef.current.caffeine = true;
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
              prefilledRef.current.alcohol = true;
            }
          }
          if (sugar) {
            setEditSugarG(sugar.amount.toString());
            prefilledRef.current.sugar = true;
          }
          })
          .catch(() => {
            // Leave the fields unprefilled. `parse` reads a blank unprefilled
            // field as "untouched", so a failed group read can no longer be
            // mistaken for the user clearing the substance.
          });
      }
    },
    buildUpdates: (timestamp, note) => {
      // Number, not parseInt: parseInt read "1e3" as 1 ml. A fraction is
      // refused rather than truncated (the column is an integer).
      const newAmount = Number(editAmount.trim());
      if (editAmount.trim() === "" || !Number.isFinite(newAmount) || newAmount <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return null;
      }
      if (!Number.isInteger(newAmount)) {
        toast({
          title: "Invalid amount",
          description: "Enter the amount as a whole number of ml.",
          variant: "destructive",
        });
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
      } else if (!editIsMealWater) {
        // Any other drink is labelled by its note (getLiquidTypeLabel), so a
        // rename has to reach the note or the row keeps its old name. A note
        // the user changed in this edit wins over the name.
        const newName = editBeverageName.trim();
        const originalNote = (editingRecord?.note ?? "").trim();
        const noteUntouched = (note ?? "") === originalNote;
        const noteIsName =
          originalNote === "" || originalNote === openedNameRef.current.trim();
        if (
          newName &&
          newName !== openedNameRef.current.trim() &&
          noteUntouched &&
          noteIsName
        ) {
          updates.note = newName;
        }
      }
      return updates;
    },
    mutateAsync: async ({ id, updates }) => {
      await updateMutation.mutateAsync({ id, updates });
      const u = updates as { amount: number; timestamp: number };
      const parse = (raw: string, wasPrefilled: boolean): number | null => {
        const trimmed = raw.trim();
        // Empty means "the user cleared it" → 0 → soft-delete, but only when
        // the field held a value to clear. Otherwise it is untouched (null).
        if (trimmed === "") return wasPrefilled ? 0 : null;
        const n = parseFloat(trimmed);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const prefilled = prefilledRef.current;
      const caffeineMg = editIsMealWater ? null : parse(editCaffeineMg, prefilled.caffeine);
      const alcoholAbv = editIsMealWater ? null : parse(editAlcoholAbv, prefilled.alcohol);
      const sugarG = sugarEnabled && !editIsMealWater ? parse(editSugarG, prefilled.sugar) : null;
      await syncLiquidSubstancesMutation(id, {
        timestamp: u.timestamp,
        // The drink volume is not the water amount (a spirit's water row is
        // ~60% of it): the service only scales the stored drink volume by
        // the change in water, so a time-only edit leaves the dose intact.
        waterMl: u.amount,
        ...(editingRecord && { previousWaterMl: editingRecord.amount }),
        ...(editBeverageName.trim() && { description: editBeverageName.trim() }),
        caffeineMg,
        alcoholAbv,
        sugarG,
      });
    },
  });

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
              <div className="space-y-1">
                <Label htmlFor={fid("edit-liquid-amount")} className="text-xs text-muted-foreground">Amount (ml)</Label>
                <Input id={fid("edit-liquid-amount")} type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-sm" />
              </div>
              {editIsMealWater ? (
                <p className="text-xs text-muted-foreground" data-testid="liquid-edit-meal-hint">
                  Water from a meal. Edit the meal&apos;s nutrients on the Food card; changing the time here moves the whole meal.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor={fid("edit-liquid-beverage")} className="text-xs text-muted-foreground">
                      Beverage name <span className="font-normal">(optional)</span>
                    </Label>
                    <Input
                      id={fid("edit-liquid-beverage")}
                      type="text"
                      value={editBeverageName}
                      onChange={(e) => setEditBeverageName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={fid("edit-liquid-caffeine")} className="text-xs text-muted-foreground">
                      Caffeine (mg) <span className="font-normal">(optional)</span>
                    </Label>
                    <Input
                      id={fid("edit-liquid-caffeine")}
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
                    <Label htmlFor={fid("edit-liquid-alcohol")} className="text-xs text-muted-foreground">
                      Alcohol (% ABV) <span className="font-normal">(optional)</span>
                    </Label>
                    <Input
                      id={fid("edit-liquid-alcohol")}
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
                      <Label htmlFor={fid("edit-liquid-sugar")} className="text-xs text-muted-foreground">
                        Sugar (g) <span className="font-normal">(optional)</span>
                      </Label>
                      <Input
                        id={fid("edit-liquid-sugar")}
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
                </>
              )}
            </InlineEditFormShell>
          )}
        />
    </ModuleCard>
  );
}
