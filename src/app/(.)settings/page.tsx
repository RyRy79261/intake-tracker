"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
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
      // Navigation happens in onAnimationEnd to wait for exit animation
    }
  };

  const handleAnimationEnd = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  // Don't render anything while checking PIN
  if (isChecking) {
    return null;
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={handleOpenChange}
      onAnimationEnd={handleAnimationEnd}
      direction="right"
      handleOnly={true}
    >
      <DrawerContent direction="right" className="overflow-y-auto p-6">
        <div data-vaul-no-drag className="h-full overflow-y-auto">
          <SettingsContent />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
