"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";

/**
 * Settings → Privacy & Security → Account card.
 *
 * Shows the current user's email and a Sign Out button that calls
 * Neon Auth's signOut and then redirects to /auth so the middleware
 * hard gate (D-03) takes over. Lives inside the Phase 40 Privacy &
 * Security accordion group; the wiring in `src/app/settings/page.tsx`
 * is unchanged — only the content of this file is rewritten.
 */
export function AccountSection() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-6 rounded-lg bg-slate-50 dark:bg-slate-900 border">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.user) return null;

  const email = session.user.email ?? "Signed in";

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
          <p className="text-sm font-medium">{email}</p>
          <p className="text-xs text-muted-foreground">
            Signed in via Neon Auth
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() =>
            signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.replace("/auth");
                  router.refresh();
                },
              },
            })
          }
        >
        <LogOut className="w-4 h-4" />
        Sign Out
      </Button>
    </div>
  );
}
