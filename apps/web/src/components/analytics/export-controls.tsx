"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@intake/ui/button";
import { useToast } from "@intake/ui/use-toast";
import { exportToPDF, exportAllRecordsCSV } from "@/lib/export-service";
import type { TimeRange } from "@intake/types/analytics";

interface ExportControlsProps {
  range: TimeRange;
}

export function ExportControls({ range }: ExportControlsProps) {
  const { toast } = useToast();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const handlePDF = async () => {
    setPdfLoading(true);
    try {
      await exportToPDF(range);
      toast({ title: "PDF exported", description: "Health report downloaded." });
    } catch (e) {
      console.error("PDF export failed:", e);
      toast({
        title: "Export failed",
        description: "Could not generate PDF report.",
        variant: "destructive",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCSV = async () => {
    setCsvLoading(true);
    try {
      await exportAllRecordsCSV(range);
      toast({ title: "CSV exported", description: "Health data downloaded." });
    } catch (e) {
      console.error("CSV export failed:", e);
      toast({
        title: "Export failed",
        description: "Could not generate CSV export.",
        variant: "destructive",
      });
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div className="wm-exp">
      <Button variant="outline" onClick={handlePDF} disabled={pdfLoading}>
        <FileText />
        {pdfLoading ? "Generating..." : "Export PDF"}
      </Button>
      <Button variant="outline" onClick={handleCSV} disabled={csvLoading}>
        <Download />
        {csvLoading ? "Exporting..." : "Export CSV"}
      </Button>
    </div>
  );
}
