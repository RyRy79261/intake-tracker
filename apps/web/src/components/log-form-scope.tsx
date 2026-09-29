"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

interface LogFormScopeValue {
  idPrefix: string;
  onLogged: () => void;
}

const noop = () => {};

const LogFormScopeContext = createContext<LogFormScopeValue>({ idPrefix: "", onLogged: noop });

/**
 * Wraps a log form (one of the home-screen cards) mounted somewhere other
 * than the home screen, such as the Log sheet.
 *
 * - `idPrefix` prefixes the form's field ids, so the sheet's copy of a card
 *   does not collide with the card on the home screen behind it (a
 *   `<label for>` resolves to the first element with that id).
 * - `onLogged` runs after the form saves a new record, so the sheet can close.
 */
export function LogFormScope({
  idPrefix,
  onLogged,
  children,
}: {
  idPrefix: string;
  onLogged?: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ idPrefix, onLogged: onLogged ?? noop }), [idPrefix, onLogged]);
  return <LogFormScopeContext.Provider value={value}>{children}</LogFormScopeContext.Provider>;
}

/** Returns a function that turns a field name into a scoped DOM id. */
export function useFieldId(): (name: string) => string {
  const { idPrefix } = useContext(LogFormScopeContext);
  return useCallback((name: string) => `${idPrefix}${name}`, [idPrefix]);
}

/** Call after a form saves a new record. A no-op outside a LogFormScope. */
export function useOnLogged(): () => void {
  return useContext(LogFormScopeContext).onLogged;
}
