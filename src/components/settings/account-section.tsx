"use client";

import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
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
  const { data: session, isPending } = useSession();

  if (isPending || !session?.user) return null;

  const email = session.user.email ?? "Signed in";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <User className="w-4 h-4" />
        <h3 className="font-semibold">Account</h3>
      </div>
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
                  window.location.href = "/auth";
                },
              },
            })
          }
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
