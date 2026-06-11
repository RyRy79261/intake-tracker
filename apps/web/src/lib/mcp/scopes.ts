/**
 * MCP connector scopes.
 *
 * Single read-only scope today. Future write tooling would add
 * `intake-tracker:write` and surface it on the consent screen separately.
 */
export const SUPPORTED_SCOPES = ["intake-tracker:read"] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

export const DEFAULT_SCOPE: Scope = "intake-tracker:read";

export function parseScopeString(scope: string | null | undefined): Scope[] {
  if (!scope) return [DEFAULT_SCOPE];
  const requested = scope.split(/\s+/).filter(Boolean);
  const allowed = requested.filter((s): s is Scope =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  return allowed.length > 0 ? allowed : [DEFAULT_SCOPE];
}

export function serialiseScopes(scopes: Scope[]): string {
  return scopes.join(" ");
}

export function hasScope(granted: string, required: Scope): boolean {
  return granted.split(/\s+/).includes(required);
}
