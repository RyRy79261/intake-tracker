"use client";

/**
 * PROTOTYPE tooling — throwaway. A floating bar that cycles UI prototype
 * variants (`?variant=`), from the `prototype` skill (.claude/skills/prototype).
 *
 * Shown only in development and on Vercel preview deployments, never in a
 * production build.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PROTOTYPES_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

const STORE_KEY = "prototype-variant";

// Read at module load: the shell rewrites a window deep link's URL before the
// window (and so this hook) mounts, dropping `?variant=`.
const INITIAL_URL_VARIANT =
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("variant");

/**
 * The current variant: `?variant=` on load, else the last one picked this
 * session (the shell rewrites window deep links and can drop the param).
 */
export function usePrototypeVariant(keys: readonly string[], fallback: string) {
  const [variant, setVariant] = useState(fallback);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("variant") ?? INITIAL_URL_VARIANT;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(STORE_KEY);
    } catch {
      // storage blocked: the variant just will not persist
    }
    const pick = [fromUrl, stored].find((v): v is string => !!v && keys.includes(v));
    if (pick) {
      setVariant(pick);
      try {
        sessionStorage.setItem(STORE_KEY, pick);
      } catch {
        // storage blocked: the variant just will not persist
      }
      const url = new URL(window.location.href);
      url.searchParams.set("variant", pick);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [keys]);

  const choose = useCallback((v: string) => {
    setVariant(v);
    try {
      sessionStorage.setItem(STORE_KEY, v);
    } catch {
      // storage blocked: the variant just will not persist
    }
    const url = new URL(window.location.href);
    url.searchParams.set("variant", v);
    // Keep the shell's history state so its Back handling is untouched.
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return [variant, choose] as const;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = useCallback(
    (step: number) => onChange(variants[(idx + step + variants.length) % variants.length]!.key),
    [idx, variants, onChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) go(-1);
      if (e.key === "ArrowRight" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const v = variants[idx]!;
  return (
    <div
      role="toolbar"
      aria-label="Prototype variant"
      data-print-hide
      style={{
        position: "fixed",
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: "#111",
        color: "#fff",
        boxShadow: "0 6px 24px rgba(0,0,0,.35)",
        border: "2px dashed #f0b400",
        font: "600 13px/1 system-ui, sans-serif",
      }}
    >
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)} style={btn}>
        <ChevronLeft size={18} />
      </button>
      <span style={{ padding: "0 8px", whiteSpace: "nowrap" }}>
        {v.key} <span style={{ opacity: 0.7, fontWeight: 400 }}>({v.name})</span>
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)} style={btn}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  borderRadius: 999,
  background: "#2a2a2a",
  color: "#fff",
  border: 0,
  cursor: "pointer",
};
