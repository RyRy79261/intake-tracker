"use client";

import { useCallback, useState } from "react";

/**
 * Inline validation text under a numeric settings field — what
 * `validateAndSave` returns when it clamped or rejected the typed value.
 */
export function SettingFieldMessage({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** Per-field validation messages for a settings section, keyed by field. */
export function useFieldMessages<K extends string>() {
  const [messages, setMessages] = useState<Partial<Record<K, string | null>>>({});
  const setMessage = useCallback(
    (key: K, message: string | null) =>
      setMessages((prev) => ({ ...prev, [key]: message })),
    []
  );
  return [messages, setMessage] as const;
}
