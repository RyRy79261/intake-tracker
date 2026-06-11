import { useState, useEffect } from "react";
import { db } from "@/lib/db";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StorageInfo {
  storageUsage: string | null;
  storageQuota: string | null;
  totalRecords: number | null;
}

export function useStorageInfo(): StorageInfo {
  const [storageUsage, setStorageUsage] = useState<string | null>(null);
  const [storageQuota, setStorageQuota] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState<number | null>(null);

  useEffect(() => {
    // Storage estimate
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage != null) setStorageUsage(formatBytes(estimate.usage));
        if (estimate.quota != null) setStorageQuota(formatBytes(estimate.quota));
      }).catch(() => {
        // Storage API unavailable
      });
    }

    // Record counts
    Promise.all([
      db.intakeRecords.count(),
      db.weightRecords.count(),
      db.bloodPressureRecords.count(),
      db.eatingRecords.count(),
      db.urinationRecords.count(),
      db.defecationRecords.count(),
      db.substanceRecords.count(),
      db.prescriptions.count(),
      db.medicationPhases.count(),
      db.phaseSchedules.count(),
      db.inventoryItems.count(),
      db.inventoryTransactions.count(),
      db.doseLogs.count(),
      db.titrationPlans.count(),
      db.dailyNotes.count(),
      db.auditLogs.count(),
    ]).then((counts) => {
      setTotalRecords(counts.reduce((sum, c) => sum + c, 0));
    }).catch(() => {
      // Dexie unavailable
    });
  }, []);

  return { storageUsage, storageQuota, totalRecords };
}
