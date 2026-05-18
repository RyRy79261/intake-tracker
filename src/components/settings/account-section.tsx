"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, LogOut, Sparkles, Bell, CloudUpload } from "lucide-react";
import { useAuth } from "@/components/auth-guard";
import { handleSignOut } from "@/lib/sign-out";

export function AccountSection() {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-6 rounded-lg bg-slate-50 dark:bg-slate-900 border">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
          <p className="text-sm font-medium mb-1">Not signed in</p>
          <p className="text-xs text-muted-foreground mb-3">
            Sign in to unlock:
          </p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              AI food & drink parsing
            </li>
            <li className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-blue-500" />
              Dose reminder notifications
            </li>
            <li className="flex items-center gap-2">
              <CloudUpload className="w-3.5 h-3.5 text-emerald-500" />
              Cloud sync across devices
            </li>
          </ul>
        </div>
        <Button
          className="w-full gap-2"
          onClick={() => router.push("/auth")}
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
      </div>
    );
  }

  const email = user?.email ?? "Signed in";

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
