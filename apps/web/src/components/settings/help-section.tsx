"use client";

import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@intake/ui/button";
import { SubHead, helpClass } from "@/components/settings/settings-kit";

/** Settings › Help & Manual: opens the user manual (`/help`). */
export function HelpSection() {
  const router = useRouter();

  return (
    <>
      <SubHead icon={BookOpen}>User manual</SubHead>
      <p className={helpClass}>
        Step-by-step guides for every card, input and feature in the app —
        how to log and edit entries, set up medications, switch on the AI
        helpers, and what happens to your data.
      </p>
      <Button className="self-start" onClick={() => router.push("/help")}>
        <BookOpen className="h-4 w-4" />
        Open the manual
      </Button>
    </>
  );
}
