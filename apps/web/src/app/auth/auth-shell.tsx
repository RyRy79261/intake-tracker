"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@intake/ui/card";
import { Button } from "@intake/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className={cn("w-full max-w-sm", className)}>
        <div className="mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
        <Card className="overflow-hidden p-0">
          <CardContent className="p-6 md:p-8">{children}</CardContent>
        </Card>
        <p className="px-6 pt-4 text-center text-xs text-muted-foreground">
          Your health data stays on your device. Sign in lets you sync across
          devices.
        </p>
        <p className="px-6 pt-2 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy &amp; Disclaimer
          </Link>
        </p>
      </div>
    </div>
  );
}
