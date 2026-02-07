/**
 * Storage adapter that routes operations to either local (IndexedDB) 
 * or server (Neon Postgres) based on the current storage mode setting.
 */

import { useSettingsStore } from "@/stores/settings-store";
import * as localIntakeService from "./intake-service";
import * as localHealthService from "./health-service";
import * as serverStorage from "./server-storage";
import type { IntakeRecord, WeightRecord, BloodPressureRecord } from "./db";

// Type for auth headers
type AuthHeaders = { Authorization: string };

// ==================== Intake Records ====================

export async function addIntakeRecord(
  type: "water" | "salt",
  amount: number,
  source: string = "manual",
  timestamp?: number,
  note?: string,
  authHeaders?: AuthHeaders
): Promise<IntakeRecord> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.addIntakeRecord(type, amount, source, timestamp, note, authHeaders);
  }
  
  return localIntakeService.addIntakeRecord(type, amount, source, timestamp, note);
}

export async function deleteIntakeRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.deleteIntakeRecord(id, authHeaders);
  }
  
  return localIntakeService.deleteIntakeRecord(id);
}

export async function updateIntakeRecord(
  id: string,
  updates: { amount?: number; timestamp?: number; note?: string },
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.updateIntakeRecord(id, updates, authHeaders);
  }
  
  return localIntakeService.updateIntakeRecord(id, updates);
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getRecordsInLast24Hours(type, authHeaders);
  }
  
  return localIntakeService.getRecordsInLast24Hours(type);
}

export async function getTotalInLast24Hours(
  type: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<number> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getTotalInLast24Hours(type, authHeaders);
  }
  
  return localIntakeService.getTotalInLast24Hours(type);
}

export async function getAllIntakeRecords(
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getAllRecords(authHeaders);
  }
  
  return localIntakeService.getAllRecords();
}

export async function getRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getRecordsByDateRange(startTime, endTime, type, authHeaders);
  }
  
  return localIntakeService.getRecordsByDateRange(startTime, endTime, type);
}

// ==================== Weight Records ====================

export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string,
  authHeaders?: AuthHeaders
): Promise<WeightRecord> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.addWeightRecord(weight, timestamp, note, authHeaders);
  }
  
  return localHealthService.addWeightRecord(weight, timestamp, note);
}

export async function getWeightRecords(
  limit?: number,
  authHeaders?: AuthHeaders
): Promise<WeightRecord[]> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getWeightRecords(limit, authHeaders);
  }
  
  return localHealthService.getWeightRecords(limit);
}

export async function getLatestWeightRecord(
  authHeaders?: AuthHeaders
): Promise<WeightRecord | undefined> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getLatestWeightRecord(authHeaders);
  }
  
  return localHealthService.getLatestWeightRecord();
}

export async function deleteWeightRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.deleteWeightRecord(id, authHeaders);
  }
  
  return localHealthService.deleteWeightRecord(id);
}

export async function updateWeightRecord(
  id: string,
  updates: { weight?: number; timestamp?: number; note?: string },
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.updateWeightRecord(id, updates, authHeaders);
  }
  
  return localHealthService.updateWeightRecord(id, updates);
}

// ==================== Blood Pressure Records ====================

export async function addBloodPressureRecord(
  systolic: number,
  diastolic: number,
  position: "standing" | "sitting",
  arm: "left" | "right",
  heartRate?: number,
  timestamp?: number,
  note?: string,
  authHeaders?: AuthHeaders
): Promise<BloodPressureRecord> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.addBloodPressureRecord(
      systolic, diastolic, position, arm, heartRate, timestamp, note, authHeaders
    );
  }
  
  return localHealthService.addBloodPressureRecord(
    systolic, diastolic, position, arm, heartRate, timestamp, note
  );
}

export async function getBloodPressureRecords(
  limit?: number,
  authHeaders?: AuthHeaders
): Promise<BloodPressureRecord[]> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getBloodPressureRecords(limit, authHeaders);
  }
  
  return localHealthService.getBloodPressureRecords(limit);
}

export async function getLatestBloodPressureRecord(
  authHeaders?: AuthHeaders
): Promise<BloodPressureRecord | undefined> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.getLatestBloodPressureRecord(authHeaders);
  }
  
  return localHealthService.getLatestBloodPressureRecord();
}

export async function deleteBloodPressureRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.deleteBloodPressureRecord(id, authHeaders);
  }
  
  return localHealthService.deleteBloodPressureRecord(id);
}

export async function updateBloodPressureRecord(
  id: string,
  updates: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    position?: "sitting" | "standing";
    arm?: "left" | "right";
    timestamp?: number;
    note?: string;
  },
  authHeaders?: AuthHeaders
): Promise<void> {
  const { storageMode } = useSettingsStore.getState();
  
  if (storageMode === "server") {
    return serverStorage.updateBloodPressureRecord(id, updates, authHeaders);
  }
  
  return localHealthService.updateBloodPressureRecord(id, updates);
}

// ==================== Utility ====================

/**
 * Get the current storage mode
 */
export function getStorageMode(): "local" | "server" {
  return useSettingsStore.getState().storageMode;
}

/**
 * Check if currently using server storage
 */
export function isServerStorage(): boolean {
  return useSettingsStore.getState().storageMode === "server";
}
