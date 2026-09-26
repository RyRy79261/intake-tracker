"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// History lives on /analytics now; this route only keeps old bookmarks and
// installed-PWA shortcuts working.
export default function HistoryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/analytics");
  }, [router]);

  return null;
}
