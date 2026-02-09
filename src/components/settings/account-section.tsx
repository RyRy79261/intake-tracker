"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";

export function AccountSection() {
  const { authenticated, user, logout } = usePrivy();

  if (!authenticated) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <User className="w-4 h-4" />
        <h3 className="font-semibold">Account</h3>
      </div>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
          <p className="text-sm font-medium">{user?.email?.address || "Authenticated user"}</p>
          <p className="text-xs text-muted-foreground">Signed in</p>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
