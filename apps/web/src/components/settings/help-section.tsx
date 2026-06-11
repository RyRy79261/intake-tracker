"use client";

import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HelpSection() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
        <BookOpen className="h-4 w-4" />
        <h3 className="font-semibold">User manual</h3>
      </div>
      <div className="space-y-3 pl-6">
        <p className="text-sm text-muted-foreground">
          Step-by-step guides for every card, input and feature in the app —
          how to log and edit entries, set up medications, switch on the AI
          helpers, and what happens to your data.
        </p>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => router.push("/help")}
        >
          <BookOpen className="h-4 w-4" />
          Open the manual
        </Button>
      </div>
    </div>
  );
}
