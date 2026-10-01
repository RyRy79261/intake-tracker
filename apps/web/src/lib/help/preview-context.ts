"use client";

import { createContext, useContext } from "react";

const InPreviewContext = createContext(false);

/** Wraps a manual's live preview (see `ComponentPreview`). */
export const InPreviewProvider = InPreviewContext.Provider;

/**
 * True inside a manual's live preview. Its reads go to the sample database;
 * everything else waits for the real one (`useLiveQuery`), and components
 * that would reach outside themselves (open a window) stay put.
 */
export function useInPreview(): boolean {
  return useContext(InPreviewContext);
}
