import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className={cn("w-full max-w-sm", className)}>
        <Card className="overflow-hidden p-0">
          <CardContent className="p-6 md:p-8">{children}</CardContent>
        </Card>
        <p className="px-6 pt-4 text-center text-xs text-muted-foreground">
          Your health data stays on your device. Sign in lets you sync across
          devices.
        </p>
      </div>
    </div>
  );
}
