"use client";

import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { handleSignOut } from "@/lib/sign-out";

export function AuthButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <User className="w-4 h-4" />
      </Button>
    );
  }

  if (!session?.user) {
    return null;
  }

  const displayName = session.user.email ?? session.user.name ?? "User";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {displayName}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
