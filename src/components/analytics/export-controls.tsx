"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF, exportAllRecordsCSV } from "@/lib/export-service";
import type { TimeRange } from "@/lib/analytics-types";

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
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handlePDF}
        disabled={pdfLoading}
      >
        <FileText className="h-4 w-4 mr-1" />
        {pdfLoading ? "Generating..." : "Export PDF"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleCSV}
        disabled={csvLoading}
      >
        <Download className="h-4 w-4 mr-1" />
        {csvLoading ? "Exporting..." : "Export CSV"}
      </Button>
    </div>
  );
}
