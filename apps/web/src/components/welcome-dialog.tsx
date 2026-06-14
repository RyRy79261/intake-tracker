"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { Droplets, Smartphone, Hand, LifeBuoy } from "lucide-react";
import { WELCOME_SEEN_KEY } from "@/lib/constants";

/**
 * First-launch greeting. The "seen" flag lives only in localStorage and is
 * intentionally never synced to the cloud, so it shows once per device.
 */
export function WelcomeDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The shake gesture only works on touch devices, so desktop users are
  // pointed to the Help section in Settings instead.
  const [isTouch, setIsTouch] = useState(true);

  // Never greet on the auth pages — the modal overlay would block the
  // sign-in form (and a "welcome" popup makes no sense before login).
  const onAuthPage = pathname.startsWith("/auth");

  useEffect(() => {
    if (onAuthPage) return;
    if (localStorage.getItem(WELCOME_SEEN_KEY) !== "true") {
      setOpen(true);
    }
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, [onAuthPage]);

  function dismiss() {
    localStorage.setItem(WELCOME_SEEN_KEY, "true");
    setOpen(false);
  }

  if (onAuthPage) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 p-3 rounded-full bg-sky-100 dark:bg-sky-900/40">
            <Droplets className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          </div>
          <DialogTitle className="text-xl">Welcome to Intake Tracker</DialogTitle>
          <DialogDescription>
            A quick heads-up before you get started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/50">
            {isTouch ? (
              <Hand className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <LifeBuoy className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTouch
                ? "Lost or need help? Just shake your phone."
                : "Lost or need help? Open the Help section in Settings."}
            </p>
          </div>
          <div className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/50">
            <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Install this web app to your phone for a more app-like experience.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
