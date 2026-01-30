"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, User } from "lucide-react";

export function AuthButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  // Show nothing while Privy is initializing
  if (!ready) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <User className="w-4 h-4" />
      </Button>
    );
  }

  if (authenticated) {
    const displayName = user?.email?.address || user?.wallet?.address?.slice(0, 8) || "User";
    
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={login}
      className="gap-2"
    >
      <LogIn className="w-4 h-4" />
      <span className="hidden sm:inline">Sign In</span>
    </Button>
  );
}
