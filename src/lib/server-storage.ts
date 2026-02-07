/**
 * Server storage service - client-side functions that call the API routes
 * for storing data in Neon Postgres instead of local IndexedDB.
 */

import type { IntakeRecord, WeightRecord, BloodPressureRecord } from "./db";

// Helper to get auth headers (will be provided by the caller)
type AuthHeaders = {
  Authorization: string;
};

// API base path
const API_BASE = "/api/storage";

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { headers: AuthHeaders }
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ==================== Intake Records ====================

export async function addIntakeRecord(
  type: "water" | "salt",
  amount: number,
  source: string = "manual",
  timestamp?: number,
  note?: string,
  authHeaders?: AuthHeaders
): Promise<IntakeRecord> {
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<IntakeRecord>("/intake", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      type,
      amount,
      source,
      timestamp: timestamp ?? Date.now(),
      note: note?.trim() || undefined,
    }),
  });
}

export async function deleteIntakeRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/intake/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
}

export async function updateIntakeRecord(
  id: string,
  updates: { amount?: number; timestamp?: number; note?: string },
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/intake/${id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify(updates),
  });
}

export async function getRecordsInLast24Hours(
  type?: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  if (!authHeaders) throw new Error("Authentication required");
  
  const params = new URLSearchParams();
  params.set("timeRange", "24h");
  if (type) params.set("type", type);
  
  return apiFetch<IntakeRecord[]>(`/intake?${params}`, {
    method: "GET",
    headers: authHeaders,
  });
}

export async function getTotalInLast24Hours(
  type: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<number> {
  const records = await getRecordsInLast24Hours(type, authHeaders);
  return records.reduce((sum, record) => sum + record.amount, 0);
}

export async function getAllRecords(
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<IntakeRecord[]>("/intake?all=true", {
    method: "GET",
    headers: authHeaders,
  });
}

export async function getRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: "water" | "salt",
  authHeaders?: AuthHeaders
): Promise<IntakeRecord[]> {
  if (!authHeaders) throw new Error("Authentication required");
  
  const params = new URLSearchParams();
  params.set("startTime", startTime.toString());
  params.set("endTime", endTime.toString());
  if (type) params.set("type", type);
  
  return apiFetch<IntakeRecord[]>(`/intake?${params}`, {
    method: "GET",
    headers: authHeaders,
  });
}

// ==================== Weight Records ====================

export async function addWeightRecord(
  weight: number,
  timestamp?: number,
  note?: string,
  authHeaders?: AuthHeaders
): Promise<WeightRecord> {
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<WeightRecord>("/weight", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      weight,
      timestamp: timestamp ?? Date.now(),
      note: note?.trim() || undefined,
    }),
  });
}

export async function getWeightRecords(
  limit?: number,
  authHeaders?: AuthHeaders
): Promise<WeightRecord[]> {
  if (!authHeaders) throw new Error("Authentication required");
  
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit.toString());
  
  return apiFetch<WeightRecord[]>(`/weight?${params}`, {
    method: "GET",
    headers: authHeaders,
  });
}

export async function getLatestWeightRecord(
  authHeaders?: AuthHeaders
): Promise<WeightRecord | undefined> {
  const records = await getWeightRecords(1, authHeaders);
  return records[0];
}

export async function deleteWeightRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/weight/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
}

export async function updateWeightRecord(
  id: string,
  updates: { weight?: number; timestamp?: number; note?: string },
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/weight/${id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify(updates),
  });
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
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<BloodPressureRecord>("/blood-pressure", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      systolic,
      diastolic,
      position,
      arm,
      heartRate,
      timestamp: timestamp ?? Date.now(),
      note: note?.trim() || undefined,
    }),
  });
}

export async function getBloodPressureRecords(
  limit?: number,
  authHeaders?: AuthHeaders
): Promise<BloodPressureRecord[]> {
  if (!authHeaders) throw new Error("Authentication required");
  
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit.toString());
  
  return apiFetch<BloodPressureRecord[]>(`/blood-pressure?${params}`, {
    method: "GET",
    headers: authHeaders,
  });
}

export async function getLatestBloodPressureRecord(
  authHeaders?: AuthHeaders
): Promise<BloodPressureRecord | undefined> {
  const records = await getBloodPressureRecords(1, authHeaders);
  return records[0];
}

export async function deleteBloodPressureRecord(
  id: string,
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/blood-pressure/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
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
  if (!authHeaders) throw new Error("Authentication required");
  
  await apiFetch<{ success: boolean }>(`/blood-pressure/${id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify(updates),
  });
}

// ==================== Export/Import ====================

export interface ExportData {
  version: number;
  exportedAt: string;
  intakeRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bloodPressureRecords: BloodPressureRecord[];
}

export async function exportAllData(
  authHeaders?: AuthHeaders
): Promise<ExportData> {
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<ExportData>("/export", {
    method: "GET",
    headers: authHeaders,
  });
}

export async function importAllData(
  data: ExportData,
  mode: "merge" | "replace" = "merge",
  authHeaders?: AuthHeaders
): Promise<{ imported: number; skipped: number }> {
  if (!authHeaders) throw new Error("Authentication required");
  
  return apiFetch<{ imported: number; skipped: number }>("/export", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ data, mode }),
  });
}

// ==================== Settings ====================

export interface ServerSettings {
  waterLimit: number;
  saltLimit: number;
  waterIncrement: number;
  saltIncrement: number;
  dayStartHour: number;
  dataRetentionDays: number;
  updatedAt: number;
}

export async function getSettings(
  authHeaders?: AuthHeaders
): Promise<ServerSettings | null> {
  if (!authHeaders) throw new Error("Authentication required");

  return apiFetch<ServerSettings | null>("/settings", {
    method: "GET",
    headers: authHeaders,
  });
}

export async function putSettings(
  settings: Partial<ServerSettings>,
  authHeaders?: AuthHeaders
): Promise<ServerSettings> {
  if (!authHeaders) throw new Error("Authentication required");

  return apiFetch<ServerSettings>("/settings", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify(settings),
  });
}

// ==================== Clear All Data ====================

export async function clearAllData(
  authHeaders?: AuthHeaders
): Promise<void> {
  if (!authHeaders) throw new Error("Authentication required");

  await apiFetch<{ success: boolean }>("/clear", {
    method: "DELETE",
    headers: authHeaders,
  });
}
