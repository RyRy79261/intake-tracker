"use client";

import { useRouter } from "next/navigation";
import { LogIn, Sparkles, Bell, CloudUpload } from "lucide-react";
import { Button } from "@intake/ui/button";
import { useAuth } from "@/components/auth-guard";
import { AccountSection } from "@/components/settings/account-section";
import { MedicalContextSection } from "@/components/profile/medical-context-section";

/**
 * Shown on the profile page when no one is signed in — explains what signing
 * in adds. The profile itself still works offline on this device.
 */
function SignedOutBlurb() {
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border space-y-3">
        <p className="text-sm font-medium">You&apos;re not signed in</p>
        <p className="text-xs text-muted-foreground">
          Your profile works on this device offline. Signing in also unlocks:
        </p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <CloudUpload className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Cloud sync — your conditions and medications on every device
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            AI insights &amp; food parsing (once AI is enabled in Settings)
          </li>
          <li className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            Dose reminder notifications
          </li>
        </ul>
      </div>
      <Button className="w-full gap-2" onClick={() => router.push("/auth")}>
        <LogIn className="w-4 h-4" />
        Sign In
      </Button>
    </div>
  );
}

/**
 * Profile page — a top-level swipeable route. Shows account state and the
 * medical context (conditions, AI-sharing opt-ins).
 */
export default function ProfilePage() {
  const { ready, authenticated } = useAuth();

  return (
    <div className="pb-10 space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
        {ready && !authenticated ? <SignedOutBlurb /> : <AccountSection />}
      </section>

      <MedicalContextSection />
    </div>
  );
}
