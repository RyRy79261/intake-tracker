"use client";

import { useAuth } from "@/components/auth-guard";
import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";
import { useSyncAutoDetect } from "@/hooks/use-sync-auto-detect";

export function SyncLifecycleMount() {
  const { authenticated } = useAuth();
  useSyncAutoDetect(authenticated);
  useSyncLifecycle(authenticated);
  return null;
}
