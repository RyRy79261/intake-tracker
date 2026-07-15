import type { ServiceResult } from "@intake/types/service";

export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function err<T = never>(error: string, details?: unknown): ServiceResult<T> {
  return { success: false, error, details };
}

export function unwrap<T>(result: ServiceResult<T>): T {
  if (result.success) return result.data;
  // Surface `details` (the exception the service caught) instead of dropping
  // it: fold its name/message into the thrown message so string-only surfaces
  // (toasts, bug reports) show the real failure, and keep the original as
  // `cause` so callers can inspect it (e.g. DatabaseClosedError recovery).
  const cause = result.details;
  const causeMsg =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : cause !== undefined
        ? String(cause)
        : undefined;
  throw new Error(
    causeMsg ? `${result.error} (${causeMsg})` : result.error,
    cause instanceof Error ? { cause } : undefined,
  );
}
