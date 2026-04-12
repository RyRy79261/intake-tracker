import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared two-column auth surface based on shadcn's login-04 block.
 * Left column: the active auth form (sign-in, sign-up, forgot, reset).
 * Right column: a branded gradient panel, hidden on mobile.
 */
export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className={cn("w-full max-w-sm md:max-w-4xl", className)}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="p-6 md:p-8">{children}</div>
            <div
              aria-hidden
              className="relative hidden md:flex md:flex-col md:items-center md:justify-center md:bg-gradient-to-br md:from-sky-500 md:via-cyan-500 md:to-teal-500 md:text-white dark:md:brightness-90"
            >
              <div className="flex flex-col items-center gap-3 px-8 text-center">
                <div className="text-5xl font-bold tracking-tight">
                  Intake Tracker
                </div>
                <p className="text-balance text-sm text-white/80">
                  Water, salt, and medication in one place.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="px-6 pt-4 text-center text-xs text-muted-foreground">
          Your health data stays on your device. Sign in lets you sync across
          devices.
        </p>
      </div>
    </div>
  );
}
