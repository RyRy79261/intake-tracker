"use client";

import Link from "next/link";
import { useSettingsStore } from "@/stores/settings-store";
import { kvClass } from "@/components/profile/profile-sec";
import { ResetSettingsButton } from "@/components/settings/reset-settings-button";
import { SubHead, helpClass } from "@/components/settings/settings-kit";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "local";
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || "development";

function envLabel(env: string): string {
  if (env === "production") return "Production";
  if (env === "preview") return "Preview";
  return "Development";
}

/**
 * Settings › About: what the app is, its version and build, where the data
 * lives, the privacy policy, and Reset to Defaults.
 */
export function AboutSection() {
  const storageMode = useSettingsStore((s) => s.storageMode);
  const shortSha = gitSha === "local" ? "local" : gitSha.slice(0, 7);

  return (
    <>
      <SubHead>This app</SubHead>
      <dl className={kvClass}>
        <dt>App</dt>
        <dd>Intake Tracker</dd>
        <dt>Version</dt>
        <dd className="font-mono">{appVersion}</dd>
        <dt>Environment</dt>
        <dd>{envLabel(vercelEnv)}</dd>
        <dt>Build</dt>
        <dd className="font-mono">{shortSha}</dd>
        <dt>Data</dt>
        <dd>
          Stored on this device{storageMode === "cloud-sync" ? ", synced to your account" : ""}
        </dd>
      </dl>
      <p className={helpClass}>
        Made to track what managing a chronic condition takes: hydration, nutrition, vitals and
        medications. Not a medical device. It does not diagnose, treat or prevent any condition;
        ask a healthcare professional for medical advice.
      </p>
      <Link
        href="/privacy"
        className="self-start text-[0.8125rem] underline underline-offset-4"
      >
        Privacy Policy &amp; Disclaimer
      </Link>
      <SubHead>Reset</SubHead>
      <ResetSettingsButton />
    </>
  );
}
