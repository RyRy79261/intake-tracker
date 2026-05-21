"use client";

import { useState } from "react";
import type { TitrationPlan } from "@/lib/db";
import type { RxEntry } from "@/components/medications/titrations/types";

const todayLocalDateString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export interface TitrationDrawerForm {
  title: string;
  setTitle: (v: string) => void;
  startNow: boolean;
  setStartNow: (v: boolean) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  warnings: string;
  setWarnings: (v: string) => void;
  entries: RxEntry[];
  setEntries: React.Dispatch<React.SetStateAction<RxEntry[]>>;

  initialized: boolean;
  setInitialized: (v: boolean) => void;

  // Entry helpers
  addEntry: () => void;
  removeEntry: (idx: number) => void;
  updateEntry: (idx: number, update: Partial<RxEntry>) => void;
  addScheduleToEntry: (entryIdx: number) => void;
  removeScheduleFromEntry: (entryIdx: number, schedIdx: number) => void;
  updateScheduleInEntry: (
    entryIdx: number,
    schedIdx: number,
    update: Partial<RxEntry["schedules"][number]>,
  ) => void;

  reset: () => void;

  // Derived
  canSubmit: boolean;

  // Prefill from editing plan
  prefillFromPlan: (plan: TitrationPlan, phasePrescriptionIds: string[]) => void;
}

export function useTitrationDrawerForm(): TitrationDrawerForm {
  const [title, setTitle] = useState("");
  const [startNow, setStartNow] = useState(false);
  const [startDate, setStartDate] = useState(todayLocalDateString());
  const [notes, setNotes] = useState("");
  const [warnings, setWarnings] = useState("");
  const [entries, setEntries] = useState<RxEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      { prescriptionId: "", schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }] },
    ]);
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEntry = (idx: number, update: Partial<RxEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...update } : e)));
  };

  const addScheduleToEntry = (entryIdx: number) => {
    setEntries((prev) => prev.map((e, i) =>
      i === entryIdx
        ? { ...e, schedules: [...e.schedules, { time: "12:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }] }
        : e
    ));
  };

  const removeScheduleFromEntry = (entryIdx: number, schedIdx: number) => {
    setEntries((prev) => prev.map((e, i) =>
      i === entryIdx
        ? { ...e, schedules: e.schedules.filter((_, j) => j !== schedIdx) }
        : e
    ));
  };

  const updateScheduleInEntry = (
    entryIdx: number,
    schedIdx: number,
    update: Partial<RxEntry["schedules"][number]>,
  ) => {
    setEntries((prev) => prev.map((e, i) =>
      i === entryIdx
        ? { ...e, schedules: e.schedules.map((s, j) => j === schedIdx ? { ...s, ...update } : s) }
        : e
    ));
  };

  const reset = () => {
    setTitle("");
    setNotes("");
    setWarnings("");
    setEntries([]);
    setStartNow(false);
    setStartDate(todayLocalDateString());
  };

  const canSubmit = Boolean(
    title.trim() &&
    entries.length > 0 &&
    entries.every(
      (e) =>
        e.prescriptionId &&
        e.schedules.length > 0 &&
        e.schedules.every((s) => s.dosage && parseFloat(s.dosage) > 0),
    )
  );

  const prefillFromPlan = (plan: TitrationPlan, phasePrescriptionIds: string[]) => {
    setTitle(plan.title);
    setNotes(plan.notes ?? "");
    setWarnings(plan.warnings?.join("\n") ?? "");
    if (plan.recommendedStartDate) {
      const d = new Date(plan.recommendedStartDate);
      setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setStartNow(false);
    } else {
      setStartNow(plan.status === "active");
    }
    setEntries(
      phasePrescriptionIds.map((prescriptionId) => ({
        prescriptionId,
        schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }],
      })),
    );
  };

  return {
    title, setTitle,
    startNow, setStartNow,
    startDate, setStartDate,
    notes, setNotes,
    warnings, setWarnings,
    entries, setEntries,
    initialized, setInitialized,
    addEntry, removeEntry, updateEntry,
    addScheduleToEntry, removeScheduleFromEntry, updateScheduleInEntry,
    reset,
    canSubmit,
    prefillFromPlan,
  };
}
