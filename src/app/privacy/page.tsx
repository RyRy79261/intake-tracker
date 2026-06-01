import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy & Disclaimer — Intake Tracker",
  description:
    "How Intake Tracker handles your health data, and the medical disclaimer for the app.",
};

// Static legal page. No auth required so it is reachable from the public web
// (app-store reviewers and prospective users need the policy URL before
// signing in). Plain server component — no client hooks — so the route can
// export metadata and prerender. Content lives inside the layout's shared
// max-w-lg container provided by SwipeNav.
//
// NOTE: this reflects the app's actual data flows as of the effective date
// below. If you change what leaves the device (sync targets, AI providers,
// analytics, etc.) update this page AND the Play Console Data Safety form to
// match. This is a plain-language policy, not legal advice — have it reviewed
// before relying on it for a production listing.

const EFFECTIVE_DATE = "1 June 2026";
const CONTACT_EMAIL = "meowzit.eth@gmail.com";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
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
          Privacy Policy &amp; Disclaimer
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>
      </div>

      {/* Medical disclaimer — surfaced first, as recommended for health apps. */}
      <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
            <p className="font-semibold">Medical disclaimer</p>
            <p>
              Intake Tracker is <strong>not a medical device</strong>. It does
              not diagnose, treat, cure, or prevent any disease or medical
              condition. It is a personal tool for keeping your own records.
            </p>
            <p>
              Any insights, estimates, or AI-generated summaries are
              observational and educational only — they are not medical advice.
              Always consult a qualified healthcare professional before making
              decisions about medication, diet, fluids, or treatment. In an
              emergency, contact your local emergency services.
            </p>
          </div>
        </div>
      </div>

      <Section title="Who this app is for">
        <p>
          Intake Tracker is a single-user personal health-tracking app built to
          help one person log hydration, nutrition, vitals (such as weight and
          blood pressure), bathroom activity, substances, and medications.
          Sign-in access is restricted to an approved list of email addresses.
        </p>
      </Section>

      <Section title="Your data lives on your device">
        <p>
          Everything you log is stored locally on your device in the browser /
          app database (IndexedDB) and works fully offline. The app does not
          need an account to function — local-only use never sends your health
          records anywhere.
        </p>
      </Section>

      <Section title="Cloud sync (optional)">
        <p>
          If you sign in and turn on cloud sync, a copy of your records is
          stored in a private, managed PostgreSQL database (provided by Neon) so
          your data is available across your devices. This copy contains the
          health data you choose to log. You can delete it again at any time
          (see “Deleting your data” below).
        </p>
      </Section>

      <Section title="Accounts &amp; sign-in">
        <p>
          Authentication is handled by Neon Auth. You can sign in with an email
          and password or with Google. We store your email address and an
          authentication identifier so we can recognise your account. We do not
          receive or store your Google password.
        </p>
      </Section>

      <Section title="AI features (optional, opt-in)">
        <p>
          Some features send text to third-party AI services to interpret it.
          These run only when you actively use them:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Text parsing &amp; insights.</strong> Descriptions of food,
            drinks, medicines, or substances you submit are sent to Anthropic
            (the Claude API) to estimate nutrition or look up information.
            Personal identifiers are stripped before the text is sent. API keys
            are held on the server and never exposed in the app.
          </li>
          <li>
            <strong>Voice logging.</strong> If you record a voice note, the
            short audio clip is sent to Groq for speech-to-text transcription.
            The resulting text is then handled like anything you typed.
          </li>
          <li>
            <strong>Medical-context insights stay off by default.</strong> AI
            features that would draw on your stored conditions or medications
            are disabled until you explicitly opt in, with a disclaimer shown
            the first time you enable one.
          </li>
        </ul>
      </Section>

      <Section title="Notifications (optional)">
        <p>
          If you enable medication or dose reminders, a push-notification
          subscription token for your device is stored on our server so we can
          deliver those reminders. Turning reminders off removes the
          subscription.
        </p>
      </Section>

      <Section title="Diagnostic / bug reports (optional)">
        <p>
          If you choose to send a bug report, it includes basic diagnostic
          information (such as app version and a sanitised error trace) to help
          fix problems. Report text is sanitised to remove obvious personal
          information before it is sent.
        </p>
      </Section>

      <Section title="Device permissions">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Microphone</strong> — used only while you are actively
            recording a voice note for logging.
          </li>
          <li>
            <strong>Notifications</strong> — used only to deliver reminders you
            have opted into.
          </li>
          <li>
            <strong>Internet</strong> — used for sign-in, cloud sync, and the
            optional AI features above.
          </li>
        </ul>
      </Section>

      <Section title="What we do not do">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>We do not sell or rent your data.</li>
          <li>We do not show advertising.</li>
          <li>
            We do not use third-party advertising or analytics/tracking SDKs.
          </li>
        </ul>
      </Section>

      <Section title="Deleting your data">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Erase your records:</strong> in the app, go to{" "}
            <strong>Settings → Data Management → Clear all data</strong>. This
            removes your logged records on the device and propagates the
            deletion to the synced cloud copy.
          </li>
          <li>
            <strong>Remove local data:</strong> uninstalling the app (or
            clearing site data in the browser) removes the on-device copy.
          </li>
          <li>
            <strong>Delete your account:</strong> to delete your sign-in
            identity and any remaining server-side data (including notification
            subscriptions), email{" "}
            <a
              className="underline underline-offset-2"
              href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20Intake%20Tracker%20account`}
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and it will be erased.
          </li>
          <li>
            <strong>Export your data:</strong> you can download a copy from{" "}
            <strong>Settings → Data Management → Export</strong>.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Data sent to and from our servers is transmitted over HTTPS. Please
          note that on-device storage is not encrypted at rest — anyone with
          access to your unlocked device may be able to view the data stored in
          the app, so keep your device locked and protected.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This app is not directed to children and is not intended for use by
          anyone under the age of 13 (or the minimum age required in your
          country).
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          This policy may be updated from time to time. The “Effective” date at
          the top reflects the most recent version.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Email{" "}
          <a
            className="underline underline-offset-2"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
