export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function err<T = never>(error: string, details?: unknown): ServiceResult<T> {
  return { success: false, error, details };
}
