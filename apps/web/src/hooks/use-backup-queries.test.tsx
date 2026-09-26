// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";

import { useUploadBackup } from "@/hooks/use-backup-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeWeightRecord,
  makeUserProfile,
  makeInsightReport,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";
import type { BackupData } from "@/lib/backup-service";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

beforeEach(() => {
  toastMock.mockClear();
});

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

  it("replace mode tombstones existing rows before importing the backup", async () => {
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

    const live = (await db.weightRecords.toArray()).filter((r) => r.deletedAt === null);
    expect(live.map((r) => r.id)).toEqual([fresh.id]);
    // The pre-existing record was tombstoned by the replace.
    expect((await db.weightRecords.get(old.id))?.deletedAt).toBeTypeOf("number");
  });

  it("toasts the total import count, including profile and insight reports", async () => {
    const file = backupFile({
      weightRecords: [makeWeightRecord()],
      userProfile: [makeUserProfile()],
      insightReports: [makeInsightReport()],
    });

    const { result } = renderHook(() => useUploadBackup(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ file, mode: "merge" });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/^Imported 3 records/) }),
    );
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
