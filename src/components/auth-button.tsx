"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/components/auth-guard";
import { handleSignOut } from "@/lib/sign-out";

export function AuthButton() {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();

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
        onClick={() => router.push("/auth")}
        className="shrink-0"
        aria-label="Sign in"
        title="Sign in"
      >
        <LogIn className="w-5 h-5" />
      </Button>
    );
  }

  const email = user?.email;
  const initial = (email?.[0] ?? "U").toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Account menu"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {initial}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium truncate">{email ?? "Signed in"}</p>
          <p className="text-xs text-muted-foreground">AI & reminders enabled</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  );
}
