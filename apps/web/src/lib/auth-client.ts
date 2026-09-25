"use client";

import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import {
  saveAuthToken,
  getAuthToken,
  clearAuthToken,
  isCapacitorMode,
} from "@/lib/api-fetch";

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || undefined;

export const authClient = createAuthClient(baseURL as string, {
  adapter: BetterAuthReactAdapter(),
});

const _signIn = authClient.signIn;
const _signOut = authClient.signOut;

export const signIn = new Proxy(_signIn, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver);
    if (typeof original !== "function") return original;
    if (prop === "email") {
      return async (
        opts: Parameters<typeof _signIn.email>[0],
        ...rest: unknown[]
      ) => {
        const callOpts = isCapacitorMode()
          ? { ...opts, callbackURL: undefined }
          : opts;
        const result = await (original as typeof _signIn.email)(
          callOpts as Parameters<typeof _signIn.email>[0],
          ...(rest as [])
        );
        if (isCapacitorMode() && result?.data?.token) {
          saveAuthToken(result.data.token);
        }
        return result;
      };
    }
    if (prop === "social") {
      return async (...args: Parameters<typeof _signIn.social>) => {
        const result = await original(...args);
        if (isCapacitorMode() && result?.data?.token) {
          saveAuthToken(result.data.token);
        }
        return result;
      };
    }
    return original;
  },
});

export const signOut: typeof _signOut = (async (...args) => {
  // Native has no session cookie: send the stored token so the server
  // revokes the session behind it, not just this device's copy
  // (audit native-android#8).
  const token = getAuthToken();
  clearAuthToken();
  if (!token) return _signOut(...args);
  const [opts, ...rest] = args;
  const fetchOptions = opts?.fetchOptions;
  return _signOut(
    {
      ...opts,
      fetchOptions: {
        ...fetchOptions,
        headers: {
          ...(fetchOptions?.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      },
    } as Parameters<typeof _signOut>[0],
    ...(rest as []),
  );
}) as typeof _signOut;

export const { signUp, useSession, getSession } = authClient;
