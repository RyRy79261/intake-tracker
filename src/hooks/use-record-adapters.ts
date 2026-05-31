"use client";

import { useMemo } from "react";
import {
  type IntakeRecord,
  type WeightRecord,
  type BloodPressureRecord,
  type EatingRecord,
  type UrinationRecord,
  type DefecationRecord,
} from "@/lib/db";
import { useUpdateIntake } from "@/hooks/use-intake-queries";
import {
  useUpdateWeight,
  useUpdateBloodPressure,
} from "@/hooks/use-health-queries";
import { useUpdateEating } from "@/hooks/use-eating-queries";
import { useUpdateUrination } from "@/hooks/use-urination-queries";
import { useUpdateDefecation } from "@/hooks/use-defecation-queries";
import {
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";

export type EditableType =
  | "intake"
  | "weight"
  | "bp"
  | "eating"
  | "urination"
  | "defecation";

export type FieldMap = {
  intake: { amount: string; timestamp: string; note: string };
  weight: { weight: string; timestamp: string; note: string };
  bp: {
    systolic: string;
    diastolic: string;
    heartRate: string;
    position: "sitting" | "standing";
    arm: "left" | "right";
    irregularHeartbeat?: boolean;
    timestamp: string;
    note: string;
  };
  eating: { timestamp: string; note: string };
  urination: { amount: string; timestamp: string; note: string };
  defecation: { amount: string; timestamp: string; note: string };
};

export type RecordOf<K extends EditableType> = {
  intake: IntakeRecord;
  weight: WeightRecord;
  bp: BloodPressureRecord;
  eating: EatingRecord;
  urination: UrinationRecord;
  defecation: DefecationRecord;
}[K];

export type EditingState = {
  [K in EditableType]: { type: K; record: RecordOf<K>; fields: FieldMap[K] };
}[EditableType];

export class ValidationError extends Error {}

export function initEditingState<K extends EditableType>(
  type: K,
  record: RecordOf<K>,
): EditingState {
  const ts = timestampToDateTimeLocal(record.timestamp);
  const note = (record as { note?: string }).note || "";
  switch (type) {
    case "intake": {
      const r = record as IntakeRecord;
      return {
        type: "intake",
        record: r,
        fields: { amount: r.amount.toString(), timestamp: ts, note },
      };
    }
    case "weight": {
      const r = record as WeightRecord;
      return {
        type: "weight",
        record: r,
        fields: { weight: r.weight.toString(), timestamp: ts, note },
      };
    }
    case "bp": {
      const r = record as BloodPressureRecord;
      return {
        type: "bp",
        record: r,
        fields: {
          systolic: r.systolic.toString(),
          diastolic: r.diastolic.toString(),
          heartRate: r.heartRate?.toString() || "",
          position: r.position,
          arm: r.arm,
          irregularHeartbeat: r.irregularHeartbeat ?? false,
          timestamp: ts,
          note,
        },
      };
    }
    case "eating": {
      const r = record as EatingRecord;
      return { type: "eating", record: r, fields: { timestamp: ts, note } };
    }
    case "urination": {
      const r = record as UrinationRecord;
      return {
        type: "urination",
        record: r,
        fields: { amount: r.amountEstimate || "", timestamp: ts, note },
      };
    }
    case "defecation": {
      const r = record as DefecationRecord;
      return {
        type: "defecation",
        record: r,
        fields: { amount: r.amountEstimate || "", timestamp: ts, note },
      };
    }
  }
  throw new Error(`Unknown editable type: ${type as string}`);
}

export type RecordAdapter<K extends EditableType> = {
  submit: (id: string, fields: FieldMap[K]) => Promise<void>;
};

export type RecordAdapters = { [K in EditableType]: RecordAdapter<K> };

function parseTimestamp(input: string): number {
  // dateTimeLocalToTimestamp throws a plain Error on invalid input; re-raise it
  // as a ValidationError so callers surface the friendly "Invalid date/time".
  try {
    return dateTimeLocalToTimestamp(input);
  } catch {
    throw new ValidationError("Invalid date/time");
  }
}

export function useRecordAdapters(): RecordAdapters {
  const updateIntake = useUpdateIntake();
  const updateWeight = useUpdateWeight();
  const updateBP = useUpdateBloodPressure();
  const updateEating = useUpdateEating();
  const updateUrination = useUpdateUrination();
  const updateDefecation = useUpdateDefecation();

  return useMemo<RecordAdapters>(
    () => ({
      intake: {
        async submit(id, fields) {
          const amount = parseInt(fields.amount, 10);
          if (isNaN(amount) || amount <= 0)
            throw new ValidationError("Invalid amount");
          const timestamp = parseTimestamp(fields.timestamp);
          const note = fields.note.trim() || undefined;
          await updateIntake.mutateAsync({
            id,
            updates: {
              amount,
              timestamp,
              ...(note !== undefined && { note }),
            },
          });
        },
      },
      weight: {
        async submit(id, fields) {
          const weight = parseFloat(fields.weight);
          if (isNaN(weight) || weight <= 0)
            throw new ValidationError("Invalid weight");
          const timestamp = parseTimestamp(fields.timestamp);
          const note = fields.note || undefined;
          await updateWeight.mutateAsync({
            id,
            updates: {
              weight,
              timestamp,
              ...(note !== undefined && { note }),
            },
          });
        },
      },
      bp: {
        async submit(id, fields) {
          const systolic = parseInt(fields.systolic, 10);
          const diastolic = parseInt(fields.diastolic, 10);
          if (
            isNaN(systolic) ||
            isNaN(diastolic) ||
            systolic <= 0 ||
            diastolic <= 0
          )
            throw new ValidationError("Invalid values");
          const timestamp = parseTimestamp(fields.timestamp);
          const heartRate = fields.heartRate
            ? parseInt(fields.heartRate, 10)
            : undefined;
          const note = fields.note || undefined;
          await updateBP.mutateAsync({
            id,
            updates: {
              systolic,
              diastolic,
              ...(heartRate !== undefined && { heartRate }),
              position: fields.position,
              arm: fields.arm,
              irregularHeartbeat: fields.irregularHeartbeat ?? false,
              timestamp,
              ...(note !== undefined && { note }),
            },
          });
        },
      },
      eating: {
        async submit(id, fields) {
          const timestamp = parseTimestamp(fields.timestamp);
          const note = fields.note.trim() || undefined;
          await updateEating.mutateAsync({
            id,
            updates: {
              timestamp,
              ...(note !== undefined && { note }),
            },
          });
        },
      },
      urination: {
        async submit(id, fields) {
          const timestamp = parseTimestamp(fields.timestamp);
          const amountEstimate = fields.amount || undefined;
          const note = fields.note.trim() || undefined;
          await updateUrination.mutateAsync({
            id,
            updates: {
              timestamp,
              ...(amountEstimate !== undefined && { amountEstimate }),
              ...(note !== undefined && { note }),
            },
          });
        },
      },
      defecation: {
        async submit(id, fields) {
          const timestamp = parseTimestamp(fields.timestamp);
          const amountEstimate = fields.amount || undefined;
          const note = fields.note.trim() || undefined;
          await updateDefecation.mutateAsync({
            id,
            updates: {
              timestamp,
              ...(amountEstimate !== undefined && { amountEstimate }),
              ...(note !== undefined && { note }),
            },
          });
        },
      },
    }),
    [
      updateIntake,
      updateWeight,
      updateBP,
      updateEating,
      updateUrination,
      updateDefecation,
    ],
  );
}
