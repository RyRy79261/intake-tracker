"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";

/**
 * Header auth button — shows the signed-in email and a sign-out action.
 *
 * Since middleware.ts hard-gates the entire app shell (D-03), this button
 * is only ever rendered for authenticated users. The pending-state branch
 * exists for the first paint before `useSession()` resolves; the
 * no-session branch is defensive only.
 */
export function AuthButton() {
  const router = useRouter();
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
        onClick={() =>
          signOut({
            fetchOptions: {
              onSuccess: () => {
                router.replace("/auth");
                router.refresh();
              },
              onError: () => {
                router.replace("/auth");
                router.refresh();
              },
            },
          })
        }
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
