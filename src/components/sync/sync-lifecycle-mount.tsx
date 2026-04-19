"use client";

import { useSession } from "@/lib/auth-client";
import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";

export function SyncLifecycleMount() {
  const { data: session } = useSession();
  useSyncLifecycle(!!session?.user);
  return null;
}
