// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

import {
  useUploadBackup,
  useClearAllData,
} from "@/hooks/use-backup-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeIntakeRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";
import type { BackupData } from "@/lib/backup-service";

function makeWrapper() {
  const client = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function backupFile(data: Partial<BackupData>): File {
  const payload: BackupData = {
    version: 5,
    exportedAt: new Date().toISOString(),
    intakeRecords: [],
    weightRecords: [],
    bloodPressureRecords: [],
    ...data,
  };
  return new File([JSON.stringify(payload)], "backup.json", {
    type: "application/json",
  });
}

describe("useClearAllData", () => {
  it("soft-deletes intake records rather than hard-clearing them", async () => {
    const a = makeIntakeRecord({ type: "water", amount: 250 });
    const b = makeIntakeRecord({ type: "salt", amount: 1000 });
    await seedDatabase({ intakeRecords: [a, b] });

    const { result } = renderHook(() => useClearAllData(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Rows still physically exist (tombstones), but all carry a deletedAt.
    const rows = await db.intakeRecords.toArray();
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
  });
});

describe("useUploadBackup", () => {
  it("imports new records from a backup file in merge mode", async () => {
    const incoming = makeWeightRecord({ weight: 65 });
    const file = backupFile({ weightRecords: [incoming] });

    const { result } = renderHook(() => useUploadBackup(), {
      wrapper: makeWrapper(),
    });

    let importResult: { weightImported: number } | undefined;
    await act(async () => {
      importResult = await result.current.mutateAsync({ file, mode: "merge" });
    });

    expect(importResult?.weightImported).toBe(1);
    const stored = await db.weightRecords.get(incoming.id);
    expect(stored?.weight).toBe(65);
  });

  it("skips records whose id already exists in merge mode", async () => {
    const existing = makeWeightRecord({ weight: 80 });
    await seedDatabase({ weightRecords: [existing] });

    // Same id, different content -> a health table just skips it.
    const file = backupFile({
      weightRecords: [{ ...existing, weight: 999 }],
    });

    const { result } = renderHook(() => useUploadBackup(), {
      wrapper: makeWrapper(),
    });

    let importResult: { weightImported: number; skipped: number } | undefined;
    await act(async () => {
      importResult = await result.current.mutateAsync({ file, mode: "merge" });
    });

    expect(importResult?.weightImported).toBe(0);
    expect(importResult?.skipped).toBeGreaterThanOrEqual(1);
    // The original value is untouched.
    const stored = await db.weightRecords.get(existing.id);
    expect(stored?.weight).toBe(80);
  });

  it("replace mode clears existing rows before importing the backup", async () => {
    const old = makeWeightRecord({ weight: 50 });
    await seedDatabase({ weightRecords: [old] });

    const fresh = makeWeightRecord({ weight: 90 });
    const file = backupFile({ weightRecords: [fresh] });

    const { result } = renderHook(() => useUploadBackup(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ file, mode: "replace" });
    });

    const rows = await db.weightRecords.toArray();
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(fresh.id);
    // The pre-existing record was wiped by the replace.
    expect(await db.weightRecords.get(old.id)).toBeUndefined();
  });

  it("reports an error for an invalid backup file without throwing", async () => {
    const file = new File(["not json at all"], "bad.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useUploadBackup(), {
      wrapper: makeWrapper(),
    });

    let importResult: { success: boolean; errors: string[] } | undefined;
    await act(async () => {
      importResult = await result.current.mutateAsync({ file });
    });

    expect(importResult?.errors.length).toBeGreaterThan(0);
  });
});
