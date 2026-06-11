import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Database, UserX } from "lucide-react";

export const metadata: Metadata = {
  title: "Data & Account Deletion — Intake Tracker",
  description:
    "How to delete your data or your entire account in Intake Tracker, what is removed, and what is kept.",
};

// Public, unauthenticated instructions page that backs the Google Play Data
// Safety form's "Delete account URL" (#account) and "Delete data URL" (#data)
// fields. Keep the steps here in sync with the in-app Settings flows.

const CONTACT_EMAIL = "meowzit.eth@gmail.com";

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        {icon}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function DataDeletionPage() {
  return (
    <div className="space-y-6 pb-16 pt-2">
      <div>
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          Data &amp; Account Deletion
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Intake Tracker gives you full control over your data. You can delete
          some of your data, all of it, or your entire account.
        </p>
      </div>

      {/* ---- Delete some or all of your data, keep your account ---- */}
      <Section id="data" icon={<Database className="h-5 w-5 text-sky-600" />} title="Delete your data">
        <p>
          To delete your logged data without deleting your account, in the app:
        </p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Open <strong>Settings → Storage</strong>.
          </li>
          <li>
            Under <strong>Delete data</strong>, choose a time frame — for
            example &ldquo;Older than 90 days&rdquo; or &ldquo;All data&rdquo; —
            and confirm.
          </li>
        </ol>
        <p>
          <strong>What is deleted:</strong> the health and medication records
          you logged within the time frame you choose (hydration, nutrition,
          weight, blood pressure, bathroom logs, substances, medications, dose
          history, and notes). In cloud-sync mode the matching cloud copy is
          deleted too.
        </p>
        <p>
          <strong>What is kept:</strong> your account and login, and any records
          outside the selected time frame.
        </p>
        <p>
          You can also switch back to local-only storage
          (<strong>Settings → Storage → Switch to Local only</strong>), which
          downloads your data to your device and then deletes the entire cloud
          copy.
        </p>
      </Section>

      {/* ---- Delete the whole account ---- */}
      <Section id="account" icon={<UserX className="h-5 w-5 text-red-600" />} title="Delete your account">
        <p>To permanently delete your account, in the app:</p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Open <strong>Settings → Account</strong>.
          </li>
          <li>
            Tap <strong>Delete Account</strong>, type <strong>DELETE</strong> to
            confirm, and submit.
          </li>
        </ol>
        <p>
          <strong>What is deleted:</strong> all of your data on our servers
          (every health and medication record, your medical profile, AI usage
          and saved keys, notification subscriptions) and your login identity,
          so the account no longer exists.
        </p>
        <p>
          <strong>What is kept:</strong> the copy of your data already on your
          device — the app switches to local-only mode and signs you out. To
          remove that too, use <strong>Delete data → All data</strong> first, or
          uninstall the app.
        </p>
      </Section>

      {/* ---- Retention + contact ---- */}
      <Section id="retention" icon={<Database className="h-5 w-5 text-muted-foreground" />} title="Timing & retention">
        <p>
          Deletions take effect immediately in our live database. Routine
          encrypted operational backups are rotated and purged within 30 days,
          after which no copy of the deleted data remains on our servers.
        </p>
        <p>
          If you can&apos;t access the app and want your account or data deleted,
          email{" "}
          <a
            className="underline underline-offset-2"
            href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20Intake%20Tracker%20data`}
          >
            {CONTACT_EMAIL}
          </a>{" "}
          from your account email and we&apos;ll process the request.
        </p>
      </Section>
    </div>
  );
}
