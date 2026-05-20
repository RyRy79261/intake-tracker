/**
 * Shared types + client-side diagnostics collection for the bug reporter.
 *
 * The collectors run in the browser (they read `navigator`, `window`, the
 * error-log Dexie table). The types are also imported by the server route
 * (`src/app/api/bug-report/route.ts`) so request/response shapes stay in sync.
 */

import { getErrorLogs } from "./error-log-service";
import { getDeviceId } from "./utils";
import { getDeviceTimezone } from "./timezone";
import { DB_SCHEMA_VERSION } from "./db";
import { isCapacitorMode } from "./api-fetch";

export type BugReportType = "bug" | "feature";

/** Max error-log entries attached to a report. */
export const MAX_REPORT_LOGS = 25;

export interface EnvField {
  label: string;
  value: string;
}

export interface BugReportErrorLog {
  timestamp: number;
  source: string;
  message: string;
  stack?: string;
  route?: string;
}

export interface BugReportDiagnostics {
  environment: EnvField[];
  errorLogs: BugReportErrorLog[];
}

export interface BugReportRequest {
  type: BugReportType;
  /** User's description — typed and/or dictated. */
  description: string;
  /** Raw voice transcript, when the user dictated. Kept separate so the
   *  server can note provenance; may equal part of `description`. */
  transcript?: string;
  /** Whether to let Claude restructure the report (when an Anthropic key
   *  is configured). The form works fully with this off. */
  useAi: boolean;
  diagnostics: BugReportDiagnostics;
}

export interface BugReportResponse {
  url: string;
  number: number;
}

const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "unknown";

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * Gather environment info for a bug report. Browser-only. `extra` fields are
 * appended after the standard set (the dialog uses this for AI-key status).
 */
export async function collectEnvironmentInfo(extra: EnvField[] = []): Promise<EnvField[]> {
  const fields: EnvField[] = [
    { label: "App version", value: CLIENT_VERSION },
    { label: "Build env", value: VERCEL_ENV },
    { label: "Mode", value: isCapacitorMode() ? "Capacitor (native)" : "Web" },
    { label: "DB version", value: String(DB_SCHEMA_VERSION) },
    { label: "Device ID", value: getDeviceId() },
    { label: "Timezone", value: getDeviceTimezone() },
  ];

  if (typeof navigator !== "undefined") {
    fields.push({ label: "Locale", value: navigator.language });
    fields.push({ label: "Online", value: navigator.onLine ? "yes" : "no" });
    fields.push({ label: "User agent", value: navigator.userAgent });
  }
  if (typeof window !== "undefined") {
    fields.push({
      label: "Screen",
      value: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`,
    });
    fields.push({
      label: "Viewport",
      value: `${window.innerWidth}×${window.innerHeight}`,
    });
  }

  if (typeof navigator !== "undefined" && "storage" in navigator) {
    try {
      const est = await navigator.storage.estimate();
      fields.push({
        label: "Storage",
        value: `${formatBytes(est.usage)} / ${formatBytes(est.quota)}`,
      });
    } catch {
      // estimate() can reject in some browsers — skip the field.
    }
  }

  return [...fields, ...extra];
}

/** Recent captured errors/warnings, trimmed to what's useful in a report. */
export async function collectRecentErrorLogs(
  limit = MAX_REPORT_LOGS,
): Promise<BugReportErrorLog[]> {
  const logs = await getErrorLogs(limit);
  return logs.map((l) => ({
    timestamp: l.timestamp,
    source: l.source,
    message: l.message,
    ...(l.stack ? { stack: l.stack } : {}),
    ...(l.route ? { route: l.route } : {}),
  }));
}
