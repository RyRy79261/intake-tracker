"use client";

import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { handleSignOut } from "@/lib/sign-out";

export function AccountSection() {
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
          onClick={handleSignOut}
        >
        <LogOut className="w-4 h-4" />
        Sign Out
      </Button>
    </div>
  );
}
