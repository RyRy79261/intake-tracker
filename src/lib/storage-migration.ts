/**
 * Storage migration utilities for moving data between local and server storage.
 */

import { db } from "./db";
import * as serverStorage from "./server-storage";

type AuthHeaders = { Authorization: string };

export interface MigrationResult {
  success: boolean;
  imported: number;
  skipped: number;
  error?: string;
}

/**
 * Export all local data to the server.
 * Used when switching from local to server storage mode.
 */
export async function exportToServer(
  authHeaders: AuthHeaders
): Promise<MigrationResult> {
  try {
    // Gather all local data
    const [intakeRecords, weightRecords, bloodPressureRecords] = await Promise.all([
      db.intakeRecords.toArray(),
      db.weightRecords.toArray(),
      db.bloodPressureRecords.toArray(),
    ]);

    const exportData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      intakeRecords,
      weightRecords,
      bloodPressureRecords,
    };

    // Send to server (merge mode - don't overwrite existing)
    const result = await serverStorage.importAllData(exportData, "merge", authHeaders);

    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to export to server:", error);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Import all server data to local storage.
 * Used when switching from server to local storage mode.
 */
export async function importFromServer(
  authHeaders: AuthHeaders,
  mode: "merge" | "replace" = "merge"
): Promise<MigrationResult> {
  try {
    // Fetch all data from server
    const serverData = await serverStorage.exportAllData(authHeaders);

    let imported = 0;
    let skipped = 0;

    // Clear local data if replace mode
    if (mode === "replace") {
      await Promise.all([
        db.intakeRecords.clear(),
        db.weightRecords.clear(),
        db.bloodPressureRecords.clear(),
      ]);
    }

    // Import intake records
    for (const record of serverData.intakeRecords || []) {
      try {
        if (mode === "merge") {
          const existing = await db.intakeRecords.get(record.id);
          if (existing) {
            skipped++;
            continue;
          }
        }
        await db.intakeRecords.add(record);
        imported++;
      } catch (error) {
        console.error("Failed to import intake record:", error);
        skipped++;
      }
    }

    // Import weight records
    for (const record of serverData.weightRecords || []) {
      try {
        if (mode === "merge") {
          const existing = await db.weightRecords.get(record.id);
          if (existing) {
            skipped++;
            continue;
          }
        }
        await db.weightRecords.add(record);
        imported++;
      } catch (error) {
        console.error("Failed to import weight record:", error);
        skipped++;
      }
    }

    // Import blood pressure records
    for (const record of serverData.bloodPressureRecords || []) {
      try {
        if (mode === "merge") {
          const existing = await db.bloodPressureRecords.get(record.id);
          if (existing) {
            skipped++;
            continue;
          }
        }
        await db.bloodPressureRecords.add(record);
        imported++;
      } catch (error) {
        console.error("Failed to import blood pressure record:", error);
        skipped++;
      }
    }

    return {
      success: true,
      imported,
      skipped,
    };
  } catch (error) {
    console.error("Failed to import from server:", error);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get counts of records in local and server storage.
 * Useful for showing migration preview to user.
 */
export async function getStorageCounts(
  authHeaders?: AuthHeaders
): Promise<{
  local: { intake: number; weight: number; bloodPressure: number };
  server: { intake: number; weight: number; bloodPressure: number } | null;
}> {
  // Get local counts
  const [localIntake, localWeight, localBP] = await Promise.all([
    db.intakeRecords.count(),
    db.weightRecords.count(),
    db.bloodPressureRecords.count(),
  ]);

  const local = {
    intake: localIntake,
    weight: localWeight,
    bloodPressure: localBP,
  };

  // Get server counts if authenticated
  if (authHeaders) {
    try {
      const serverData = await serverStorage.exportAllData(authHeaders);
      return {
        local,
        server: {
          intake: serverData.intakeRecords?.length || 0,
          weight: serverData.weightRecords?.length || 0,
          bloodPressure: serverData.bloodPressureRecords?.length || 0,
        },
      };
    } catch (error) {
      console.error("Failed to get server counts:", error);
    }
  }

  return { local, server: null };
}
