"use client";

import { useState } from "react";
import { Download, Shield } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Checkbox } from "@intake/ui/checkbox";
// eslint-disable-next-line no-restricted-imports
import { downloadBackup } from "@/lib/backup-service";
import {
  bodyClass,
  footClass,
  migClass,
  migHeadingClass,
  migTextClass,
} from "@/components/migration/dialog-kit";

interface BackupGateStepProps {
  onProceed: () => void;
}

export function BackupGateStep({ onProceed }: BackupGateStepProps) {
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canProceed = hasDownloaded || acknowledged;

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadBackup();
      setHasDownloaded(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className={bodyClass}>
        <div className={migClass} data-testid="migration-backup-step">
          <Shield aria-hidden="true" className="h-8 w-8 text-sodium" />
          <h3 className={migHeadingClass}>Back up your data</h3>
          <p className={migTextClass}>
            Before migrating to Cloud Sync, download a backup of all your local
            data. This ensures you can restore if anything goes wrong.
          </p>

          <Button
            onClick={handleDownload}
            disabled={downloading}
            variant="outline"
            className="border-muted-foreground"
          >
            <Download aria-hidden="true" />
            {downloading ? "Downloading…" : "Download Backup"}
          </Button>

          <label
            htmlFor="backup-ack"
            className="flex min-h-11 cursor-pointer items-start gap-2.5 text-left text-[0.9375rem]"
          >
            <Checkbox
              id="backup-ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-px border-muted-foreground data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
            />
            I have downloaded and saved my backup
          </label>
        </div>
      </div>

      <div className={footClass}>
        <Button onClick={onProceed} disabled={!canProceed}>
          Proceed to Migration
        </Button>
      </div>
    </>
  );
}
