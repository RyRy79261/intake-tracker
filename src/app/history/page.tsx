"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HistoryContent } from "@/components/history-content";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { Loader2 } from "lucide-react";

/**
 * Full page history - used when navigating directly to /history (hard nav).
 * Renders the history content in a full page layout instead of a sheet.
 */
export default function HistoryPage() {
  const router = useRouter();
  const { requirePin } = usePinProtected();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check PIN on mount
  useEffect(() => {
    let cancelled = false;

    const checkPin = async () => {
      try {
        const unlocked = await requirePin();
        if (cancelled) return;

        if (unlocked) {
          setIsUnlocked(true);
        } else {
          router.push("/");
        }
      } catch (error) {
        console.error("PIN check failed:", error);
        if (!cancelled) {
          router.push("/");
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    checkPin();
    return () => { cancelled = true; };
  }, [requirePin, router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isUnlocked) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <HistoryContent />
      </div>
    </main>
  );
}
