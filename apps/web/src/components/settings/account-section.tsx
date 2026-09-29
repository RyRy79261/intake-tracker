"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@intake/ui/button";
import { Loader2, LogIn, LogOut, Sparkles, Bell, CloudUpload, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-guard";
import { handleSignOut } from "@/lib/sign-out";
import { useSettingsStore } from "@/stores/settings-store";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { kvClass } from "@/components/profile/profile-sec";

/** Outlined Ward Console secondary button (the prototype's `.btn`). */
const actBtn = "h-10 gap-1.5 border-muted-foreground px-3";

/**
 * Account state: signed-in status, cloud sync, Sign Out and (optionally)
 * Delete Account. Used by Settings and the Profile window.
 *
 * @param showDeleteAccount - When true, renders the destructive "Delete Account"
 *   action next to Sign Out. Off by default so a caller opts in explicitly.
 */
export function AccountSection({ showDeleteAccount = false }: { showDeleteAccount?: boolean } = {}) {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();
  const storageMode = useSettingsStore((s) => s.storageMode);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!ready) {
    return (
      <div className="flex items-center justify-center border border-line p-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-[0.9375rem] font-medium">Not signed in</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            Sign in to unlock:
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.8125rem] text-muted-foreground">
            <li className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-ai" />
              AI food & drink parsing
            </li>
            <li className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 shrink-0 text-meds" />
              Dose reminder notifications
            </li>
            <li className="flex items-center gap-2">
              <CloudUpload className="h-3.5 w-3.5 shrink-0 text-water" />
              Cloud sync across devices
            </li>
          </ul>
        </div>
        <Button onClick={() => router.push("/auth")}>
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
      </div>
    );
  }

  const email = user?.email ?? "Signed in";

  return (
    <div>
      <dl className={kvClass}>
        <dt>Status</dt>
        <dd className="break-words">Signed in as {email}</dd>
        <dt>Cloud sync</dt>
        <dd className="font-mono">
          {storageMode === "cloud-sync" ? "On" : "Off (this device)"}
        </dd>
      </dl>
      <p className="mt-1 text-[0.8125rem] text-muted-foreground">
        Signed in via Neon Auth
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="outline" className={actBtn} onClick={handleSignOut}>
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
        {showDeleteAccount && (
          <Button
            variant="outline"
            className={actBtn}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </Button>
        )}
      </div>

      {showDeleteAccount && (
        <>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            Delete Account erases all your data from our servers and removes
            your login. The copy on this device is kept.
          </p>
          <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
        </>
      )}
    </div>
  );
}
