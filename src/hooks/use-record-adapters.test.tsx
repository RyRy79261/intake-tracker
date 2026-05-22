// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import {
  useRecordAdapters,
  initEditingState,
  ValidationError,
} from "@/hooks/use-record-adapters";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { timestampToDateTimeLocal } from "@/lib/date-utils";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function renderAdapters() {
  return renderHook(() => useRecordAdapters(), { wrapper });
}

const NEW_TS = "2026-03-10T14:45";
const newTsMs = () => new Date(NEW_TS).getTime();

describe("initEditingState", () => {
  it("maps an intake record into editable string fields", () => {
    const r = makeIntakeRecord({ amount: 250, note: "glass" });
    const state = initEditingState("intake", r);
    expect(state.type).toBe("intake");
    expect(state.fields).toEqual({
      amount: "250",
      timestamp: timestampToDateTimeLocal(r.timestamp),
      note: "glass",
    });
  });

  it("maps a blood pressure record including optional heart rate", () => {
    const withHr = makeBloodPressureRecord({
      systolic: 120,
      diastolic: 80,
      heartRate: 66,
      position: "standing",
      arm: "right",
    });
    const s1 = initEditingState("bp", withHr);
    if (s1.type !== "bp") throw new Error("wrong type");
    expect(s1.fields.systolic).toBe("120");
    expect(s1.fields.heartRate).toBe("66");
    expect(s1.fields.position).toBe("standing");
    expect(s1.fields.arm).toBe("right");

    const noHr = makeBloodPressureRecord();
    delete (noHr as { heartRate?: number }).heartRate;
    const s2 = initEditingState("bp", noHr);
    if (s2.type !== "bp") throw new Error("wrong type");
    expect(s2.fields.heartRate).toBe("");
  });

  it("uses an empty string for a missing note", () => {
    const r = makeWeightRecord({ weight: 70 });
    delete (r as { note?: string }).note;
    const state = initEditingState("weight", r);
    expect(state.fields.note).toBe("");
  });
});

describe("useRecordAdapters", () => {
  it("intake.submit writes parsed amount + timestamp to the database", async () => {
    const rec = makeIntakeRecord({ amount: 100, note: "old" });
    await db.intakeRecords.add(rec);

    const { result } = renderAdapters();
    await result.current.intake.submit(rec.id, {
      amount: "333",
      timestamp: NEW_TS,
      note: "  fresh  ",
    });

    const saved = await db.intakeRecords.get(rec.id);
    expect(saved?.amount).toBe(333);
    expect(saved?.timestamp).toBe(newTsMs());
    expect(saved?.note).toBe("fresh");
  });

  it("intake.submit rejects a non-positive amount with a ValidationError", async () => {
    const rec = makeIntakeRecord({ amount: 100 });
    await db.intakeRecords.add(rec);
    const { result } = renderAdapters();

    await expect(
      result.current.intake.submit(rec.id, {
        amount: "0",
        timestamp: NEW_TS,
        note: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("intake.submit rejects an invalid timestamp", async () => {
    const rec = makeIntakeRecord({ amount: 100 });
    await db.intakeRecords.add(rec);
    const { result } = renderAdapters();

    await expect(
      result.current.intake.submit(rec.id, {
        amount: "200",
        timestamp: "garbage",
        note: "",
      }),
    ).rejects.toThrow(/Invalid date/);
  });

  it("weight.submit writes a parsed float weight", async () => {
    const rec = makeWeightRecord({ weight: 70 });
    await db.weightRecords.add(rec);
    const { result } = renderAdapters();

    await result.current.weight.submit(rec.id, {
      weight: "72.5",
      timestamp: NEW_TS,
      note: "",
    });

    const saved = await db.weightRecords.get(rec.id);
    expect(saved?.weight).toBe(72.5);
    expect(saved?.timestamp).toBe(newTsMs());
  });

  it("weight.submit rejects a non-positive weight", async () => {
    const rec = makeWeightRecord({ weight: 70 });
    await db.weightRecords.add(rec);
    const { result } = renderAdapters();

    await expect(
      result.current.weight.submit(rec.id, {
        weight: "-5",
        timestamp: NEW_TS,
        note: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("bp.submit writes systolic/diastolic/heartRate and optional fields", async () => {
    const rec = makeBloodPressureRecord({ systolic: 110, diastolic: 70 });
    await db.bloodPressureRecords.add(rec);
    const { result } = renderAdapters();

    await result.current.bp.submit(rec.id, {
      systolic: "128",
      diastolic: "84",
      heartRate: "72",
      position: "standing",
      arm: "left",
      timestamp: NEW_TS,
      note: "after walk",
    });

    const saved = await db.bloodPressureRecords.get(rec.id);
    expect(saved?.systolic).toBe(128);
    expect(saved?.diastolic).toBe(84);
    expect(saved?.heartRate).toBe(72);
    expect(saved?.position).toBe("standing");
    expect(saved?.note).toBe("after walk");
  });

  it("bp.submit rejects when systolic or diastolic is invalid", async () => {
    const rec = makeBloodPressureRecord();
    await db.bloodPressureRecords.add(rec);
    const { result } = renderAdapters();

    await expect(
      result.current.bp.submit(rec.id, {
        systolic: "abc",
        diastolic: "80",
        heartRate: "",
        position: "sitting",
        arm: "left",
        timestamp: NEW_TS,
        note: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("eating.submit updates only the timestamp and note", async () => {
    const rec = makeEatingRecord({ note: "lunch" });
    await db.eatingRecords.add(rec);
    const { result } = renderAdapters();

    await result.current.eating.submit(rec.id, {
      timestamp: NEW_TS,
      note: "dinner",
    });

    const saved = await db.eatingRecords.get(rec.id);
    expect(saved?.timestamp).toBe(newTsMs());
    expect(saved?.note).toBe("dinner");
  });

  it("urination.submit writes the amount estimate", async () => {
    const rec = makeUrinationRecord({ amountEstimate: "small" });
    await db.urinationRecords.add(rec);
    const { result } = renderAdapters();

    await result.current.urination.submit(rec.id, {
      amount: "large",
      timestamp: NEW_TS,
      note: "",
    });

    const saved = await db.urinationRecords.get(rec.id);
    expect(saved?.amountEstimate).toBe("large");
    expect(saved?.timestamp).toBe(newTsMs());
  });

  it("defecation.submit writes the amount estimate and rejects bad timestamps", async () => {
    const rec = makeDefecationRecord({ amountEstimate: "small" });
    await db.defecationRecords.add(rec);
    const { result } = renderAdapters();

    await result.current.defecation.submit(rec.id, {
      amount: "medium",
      timestamp: NEW_TS,
      note: "",
    });
    const saved = await db.defecationRecords.get(rec.id);
    expect(saved?.amountEstimate).toBe("medium");

    await expect(
      result.current.defecation.submit(rec.id, {
        amount: "medium",
        timestamp: "nope",
        note: "",
      }),
    ).rejects.toThrow(/Invalid date/);
  });
});
