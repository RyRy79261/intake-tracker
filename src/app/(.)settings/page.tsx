"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SettingsContent } from "@/components/settings-content";
import { usePinProtected } from "@/hooks/use-pin-gate";

export default function SettingsInterceptPage() {
  const router = useRouter();
  const { requirePin } = usePinProtected();
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check PIN on mount
  useEffect(() => {
    const checkPin = async () => {
      const unlocked = await requirePin();
      if (unlocked) {
        setIsOpen(true);
      } else {
        // PIN check failed, go back
        router.back();
      }
      setIsChecking(false);
    };
    checkPin();
  }, [requirePin, router]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      // Don't call router.back() here - let animation complete first
    }
  };

  const handleExitComplete = () => {
    router.back();
  };

  // Don't render anything while checking PIN
  if (isChecking) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent open={isOpen} onExitComplete={handleExitComplete} className="overflow-y-auto">
        <SettingsContent />
      </SheetContent>
    </Sheet>
  );
}
