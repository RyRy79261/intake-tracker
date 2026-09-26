"use client";

import { useAuth } from "@/components/auth-guard";
import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";
import { useSyncAutoDetect } from "@/hooks/use-sync-auto-detect";

export function SyncLifecycleMount() {
  const { authenticated, user } = useAuth();
  useSyncAutoDetect(authenticated);
  useSyncLifecycle(authenticated, user?.id ?? null);
  return null;
}
