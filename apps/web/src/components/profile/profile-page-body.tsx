"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import { useAuth } from "@/components/auth-guard";
import { useSettingsStore } from "@/stores/settings-store";
import { AccountSection } from "@/components/settings/account-section";
import { MedicalContextSection } from "@/components/profile/medical-context-section";
import { ProfileSec } from "@/components/profile/profile-sec";
import { ShellIcon } from "@/components/shell/shell-icon";
import { initialsFor } from "@/components/shell/sys-bar";

const noopSubscribe = () => () => {};

/**
 * Auth state that matches the server render until hydration ends. The server
 * cannot know the session, so it (and the hydration pass) render "loading";
 * the resolved state swaps in right after.
 */
function useHydratedAuth() {
  const auth = useAuth();
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return hydrated ? auth : ({ ready: false, authenticated: false, user: null } as const);
}

/**
 * The avatar block: initials (signed in) or the profile glyph, the name, and
 * a one-line account status.
 */
function AvatarBlock() {
  const { ready, authenticated, user } = useHydratedAuth();
  const storageMode = useSettingsStore((s) => s.storageMode);

  let name: string;
  let status: string;
  if (!ready) {
    name = "Profile";
    status = "Checking sign-in…";
  } else if (authenticated) {
    name = user.name && user.name !== user.email ? user.name : user.email;
    status = `Signed in · cloud sync ${storageMode === "cloud-sync" ? "on" : "off"}`;
  } else {
    name = "Not signed in";
    status = "Records stay on this device";
  }

  return (
    <div className="mb-1.5 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-base font-semibold text-background"
      >
        {ready && authenticated ? (
          initialsFor(user.name, user.email)
        ) : (
          <ShellIcon name="profile" size={24} />
        )}
      </span>
      <div className="min-w-0">
        <h2 className="break-words text-xl font-semibold leading-tight">{name}</h2>
        <p className="text-[0.8125rem] text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}

/**
 * Shown in the Account section when no one is signed in. The profile itself
 * still works offline on this device.
 */
function SignedOutAccount() {
  const router = useRouter();
  return (
    <div>
      <p className="mb-2.5 text-[0.8125rem] text-muted-foreground">
        Logging, medications and history work without an account. Signing in
        adds AI features and cloud sync.
      </p>
      <Button onClick={() => router.push("/auth")}>
        <LogIn className="w-4 h-4" />
        Sign In
      </Button>
    </div>
  );
}

/**
 * Profile — the avatar block, Health (conditions, medications), the AI-sharing
 * opt-ins and Account. Rendered by the `/profile` route and by the Profile
 * window.
 */
export function ProfilePageBody() {
  const { ready, authenticated } = useHydratedAuth();
  const signedOut = ready && !authenticated;

  return (
    <div className="pb-4">
      <AvatarBlock />

      <MedicalContextSection signedIn={!signedOut} />

      <section aria-labelledby="profile-account" data-domain="steel">
        <ProfileSec id="profile-account">Account</ProfileSec>
        {!ready ? (
          <div className="flex items-center justify-center border border-line p-6">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : signedOut ? (
          <SignedOutAccount />
        ) : (
          <AccountSection showDeleteAccount />
        )}
      </section>
    </div>
  );
}
