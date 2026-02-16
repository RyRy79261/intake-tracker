"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "local";
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || "development";

function getEnvLabel(env: string): { label: string; className: string } {
  switch (env) {
    case "production":
      return { label: "Production", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" };
    case "preview":
      return { label: "Preview", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" };
    default:
      return { label: "Development", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" };
  }
}

export function AboutDialog() {
  const [open, setOpen] = useState(false);
  const envInfo = getEnvLabel(vercelEnv);
  const shortSha = gitSha === "local" ? "local" : gitSha.slice(0, 7);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Info className="w-4 h-4" />
          About App
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 p-3 rounded-full bg-sky-100 dark:bg-sky-900/40">
            <Droplets className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          </div>
          <DialogTitle className="text-xl">Intake Tracker</DialogTitle>
          <DialogDescription>
            Track your daily water and salt intake
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">Version</span>
            <span className="text-sm font-mono font-medium">{appVersion}</span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">Environment</span>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", envInfo.className)}>
              {envInfo.label}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">Build</span>
            <span className="text-sm font-mono text-muted-foreground">{shortSha}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
