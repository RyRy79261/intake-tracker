"use client";

import { useSession } from "@/lib/auth-client";
import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";
import { useSyncAutoDetect } from "@/hooks/use-sync-auto-detect";

export function SyncLifecycleMount() {
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  useSyncAutoDetect(authenticated);
  useSyncLifecycle(authenticated);
  return null;
}
