"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogIn, User } from "lucide-react";
import { useAuth } from "@/components/auth-guard";

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
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
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
