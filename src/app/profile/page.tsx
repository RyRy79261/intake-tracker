"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountSection } from "@/components/settings/account-section";
import { MedicalContextSection } from "@/components/profile/medical-context-section";

/**
 * Profile page — reached from the account indicator in the header. Optional to
 * visit: it shows account details and lets the user record medical conditions
 * that give AI insights clinical context.
 */
export default function ProfilePage() {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="pt-2 pb-10 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -ml-2"
          aria-label="Back"
          onClick={goBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Account and medical context
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
        <AccountSection />
      </section>

      <MedicalContextSection />
    </div>
  );
}
