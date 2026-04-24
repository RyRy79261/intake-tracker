import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Offline | Intake Tracker",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800">
        <WifiOff className="h-10 w-10 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs">
          This page hasn&apos;t been cached yet. Open it once while online and it
          will be available offline next time.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Go to home
      </Link>
    </div>
  );
}
