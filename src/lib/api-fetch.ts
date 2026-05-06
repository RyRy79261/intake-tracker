const STORAGE_KEY = "capacitor_auth_token";

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

let _token: string | null = null;

export function saveAuthToken(token: string): void {
  _token = token;
  storage()?.setItem(STORAGE_KEY, token);
}

export function getAuthToken(): string | null {
  if (_token) return _token;
  _token = storage()?.getItem(STORAGE_KEY) ?? null;
  return _token;
}

export function clearAuthToken(): void {
  _token = null;
  storage()?.removeItem(STORAGE_KEY);
}

export function isCapacitorMode(): boolean {
  return !!process.env.NEXT_PUBLIC_API_BASE_URL;
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const url = `${baseUrl}${path}`;

  if (!baseUrl) {
    return fetch(url, init);
  }

  const token = getAuthToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...init, headers });
}
