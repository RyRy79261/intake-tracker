import { PrivyClient } from "@privy-io/server-auth";

/**
 * Server-side Privy client for token verification.
 * 
 * IMPORTANT: Only import this file in server components or API routes.
 * The PRIVY_APP_SECRET should never be exposed to the client.
 */

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    return null;
  }

  if (!privyClient) {
    privyClient = new PrivyClient(appId, appSecret);
  }

  return privyClient;
}

/**
 * Parse the whitelist from environment variable
 */
function getAllowedEmails(): string[] {
  const emailsEnv = process.env.ALLOWED_EMAILS || "";
  return emailsEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedWallets(): string[] {
  const walletsEnv = process.env.ALLOWED_WALLETS || "";
  return walletsEnv
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Why a verification attempt failed. Drives how the response is shaped
 * (whether the client should be told to re-auth, prompted to contact an
 * admin, etc.).
 */
export type AuthFailureReason =
  | "no-token"
  | "invalid-token"
  | "not-whitelisted"
  | "not-configured";

export interface VerificationResult {
  success: boolean;
  userId?: string;
  email?: string;
  wallet?: string;
  error?: string;
  reason?: AuthFailureReason;
}

/**
 * Pure helper: classify a Privy-resolved user against the allow-list.
 * Extracted so it can be tested without mocking the Privy SDK.
 *
 * Empty allow-lists mean "no gate configured" — every authenticated user
 * is approved.
 */
export function classifyUser(
  userId: string,
  userEmail: string | undefined,
  userWallets: string[],
  allowedEmails: string[],
  allowedWallets: string[]
): VerificationResult {
  if (allowedEmails.length === 0 && allowedWallets.length === 0) {
    const firstWallet = userWallets[0];
    return {
      success: true,
      userId,
      ...(userEmail !== undefined && { email: userEmail }),
      ...(firstWallet !== undefined && { wallet: firstWallet }),
    };
  }

  if (userEmail && allowedEmails.includes(userEmail)) {
    return { success: true, userId, email: userEmail };
  }

  for (const wallet of userWallets) {
    if (allowedWallets.includes(wallet)) {
      return { success: true, userId, wallet };
    }
  }

  return {
    success: false,
    reason: "not-whitelisted",
    error: "Your account is not authorized to use this app",
  };
}

/**
 * Check if dev fallback is allowed
 * Only allows dev fallback if:
 * 1. Not in production, OR
 * 2. ALLOW_DEV_FALLBACK env var is explicitly set to "true"
 */
function isDevFallbackAllowed(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const explicitlyAllowed = process.env.ALLOW_DEV_FALLBACK === "true";
  
  return !isProduction || explicitlyAllowed;
}

/**
 * Verify a Privy auth token and check against whitelist.
 * Returns user info if authorized, error if not.
 */
export async function verifyAndCheckWhitelist(
  authToken: string | null
): Promise<VerificationResult> {
  if (!authToken) {
    return {
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    };
  }

  const client = getPrivyClient();
  if (!client) {
    if (isDevFallbackAllowed()) {
      console.warn(
        "Privy not configured - allowing dev fallback. " +
        "Set ALLOW_DEV_FALLBACK=true in production if this is intentional."
      );
      return { success: true, userId: "dev-user" };
    }
    console.error(
      "Privy not configured in production. " +
      "Either configure Privy or set ALLOW_DEV_FALLBACK=true."
    );
    return {
      success: false,
      reason: "not-configured",
      error: "Authentication service not configured",
    };
  }

  try {
    const verifiedClaims = await client.verifyAuthToken(authToken);
    const userId = verifiedClaims.userId;
    const user = await client.getUser(userId);

    const userEmail = user.email?.address?.toLowerCase();
    const userWallets = user.linkedAccounts
      .filter((a) => a.type === "wallet" && "address" in a)
      .map((w) => (w as { address: string }).address.toLowerCase());

    return classifyUser(
      userId,
      userEmail,
      userWallets,
      getAllowedEmails(),
      getAllowedWallets()
    );
  } catch (error) {
    console.error("Privy verification error:", error);
    return {
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    };
  }
}

/**
 * Check if Privy is configured
 */
export function isPrivyConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET
  );
}
