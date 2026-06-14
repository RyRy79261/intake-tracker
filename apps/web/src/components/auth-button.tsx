"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@intake/ui/button";
import { User } from "lucide-react";
import { useAuth } from "@/components/auth-guard";
import { cn } from "@/lib/utils";

/**
 * The account control in the header — also the nav "tab" for the /profile
 * route, so it carries the active highlight when that page is open. Always
 * navigates to /profile; the profile page itself handles the signed-out case.
 */
export function AuthButton() {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === "/profile";

  if (!ready) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="shrink-0"
        aria-label="Loading account"
      >
        <User className="w-5 h-5 text-muted-foreground/40" />
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => router.push("/profile")}
        className={cn(
          "shrink-0 transition-colors",
          isActive && "bg-primary/10 text-primary",
        )}
        aria-label="Profile"
        title="Profile"
      >
        <User className={cn("w-5 h-5", isActive && "text-primary")} />
      </Button>
    );
  }

  const email = user?.email;
  const initial = (email?.[0] ?? "U").toUpperCase();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 transition-colors",
        isActive && "bg-primary/10 text-primary",
      )}
      aria-label="Profile"
      title="Profile"
      onClick={() => router.push("/profile")}
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold">
        {initial}
      </span>
    </Button>
  );
}
