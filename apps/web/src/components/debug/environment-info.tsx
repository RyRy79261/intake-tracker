"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@intake/ui/button";
import { Info, Clipboard, ClipboardCheck } from "lucide-react";
import { isCapacitorMode } from "@/lib/api-fetch";
import { getDeviceId } from "@/lib/utils";
import { getDeviceTimezone } from "@/lib/timezone";
import { DB_SCHEMA_VERSION } from "@/lib/db";
import { useSettings } from "@/hooks/use-settings";

const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "unknown";

type EnvField = { label: string; value: string };

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

export function EnvironmentInfo() {
  const settings = useSettings();
  const [storage, setStorage] = useState<{
    quota?: number | undefined;
    usage?: number | undefined;
  } | null>(null);
  const [online, setOnline] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "storage" in navigator) {
      navigator.storage
        .estimate?.()
        .then((e) => setStorage({ quota: e.quota, usage: e.usage }))
        .catch(() => setStorage(null));
    }
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const onChange = () => setOnline(navigator.onLine);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  const fields: EnvField[] = useMemo(() => [
    { label: "App version", value: CLIENT_VERSION },
    { label: "Build env", value: VERCEL_ENV },
    { label: "Mode", value: isCapacitorMode() ? "Capacitor (native)" : "Web" },
    { label: "Node env", value: process.env.NODE_ENV ?? "unknown" },
    { label: "DB version", value: String(DB_SCHEMA_VERSION) },
    { label: "Device ID", value: getDeviceId() },
    { label: "Timezone", value: getDeviceTimezone() },
    { label: "Day-start hour", value: String(settings.dayStartHour) },
    { label: "Online", value: online ? "yes" : "no" },
    { label: "Locale", value: typeof navigator !== "undefined" ? navigator.language : "—" },
    {
      label: "Screen",
      value:
        typeof window !== "undefined"
          ? `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`
          : "—",
    },
    {
      label: "Viewport",
      value:
        typeof window !== "undefined"
          ? `${window.innerWidth}×${window.innerHeight}`
          : "—",
    },
    {
      label: "Storage",
      value: storage
        ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
        : "—",
    },
    {
      label: "User agent",
      value: typeof navigator !== "undefined" ? navigator.userAgent : "—",
    },
  ], [storage, online, settings.dayStartHour]);

  const handleCopy = useCallback(async () => {
    const text = fields.map((f) => `${f.label}: ${f.value}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in non-secure contexts; ignore.
    }
  }, [fields]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4" />
          Environment
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Clipboard className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      <div className="border rounded divide-y">
        {fields.map((f) => (
          <div
            key={f.label}
            className="flex items-start gap-2 px-2 py-1.5 text-xs"
          >
            <span className="text-muted-foreground shrink-0 w-28">
              {f.label}
            </span>
            <span className="font-mono break-all flex-1">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
