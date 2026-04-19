"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadBackup } from "@/lib/backup-service";

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
    <div className="flex flex-col items-center gap-6 p-6 text-center">
      <ShieldCheck className="h-12 w-12 text-amber-500" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Back up your data</h2>
        <p className="text-sm text-muted-foreground">
          Before migrating to Cloud Sync, download a backup of all your local
          data. This ensures you can restore if anything goes wrong.
        </p>
      </div>

      <Button
        onClick={handleDownload}
        disabled={downloading}
        variant="outline"
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        {downloading ? "Downloading…" : "Download Backup"}
      </Button>

      <div className="flex items-center gap-2">
        <Checkbox
          id="backup-ack"
          checked={acknowledged}
          onCheckedChange={(v) => setAcknowledged(v === true)}
        />
        <label htmlFor="backup-ack" className="text-sm cursor-pointer">
          I have downloaded and saved my backup
        </label>
      </div>

      <Button onClick={onProceed} disabled={!canProceed} className="w-full">
        Proceed to Migration
      </Button>
    </div>
  );
}
