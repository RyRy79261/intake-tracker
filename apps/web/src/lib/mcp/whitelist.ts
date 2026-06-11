import "server-only";

/**
 * Shared ALLOWED_EMAILS check.
 *
 * Mirrors the logic baked into withAuth (src/lib/auth-middleware.ts) so MCP
 * routes can apply the same gate without re-implementing it. If the env var
 * is empty, no whitelist is enforced.
 */
export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return true;
  if (!email) return false;
  return allowed.includes(email.toLowerCase());
}
