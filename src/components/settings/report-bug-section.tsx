"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportBugDialog } from "@/components/report-bug-dialog";

export function ReportBugSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
        <Bug className="w-4 h-4" />
        <h3 className="font-semibold">Report a bug</h3>
      </div>
      <div className="space-y-3 pl-6">
        <p className="text-sm text-muted-foreground">
          Found a problem, or have an idea? File it on GitHub directly from the
          app. Environment info and recent error logs are attached
          automatically, with personal data removed first.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Bug className="h-4 w-4" />
          Report a bug
        </Button>
      </div>
      <ReportBugDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
