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

export interface VerificationResult {
  success: boolean;
  userId?: string;
  email?: string;
  wallet?: string;
  error?: string;
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
    return { success: false, error: "No auth token provided" };
  }

  const client = getPrivyClient();
  if (!client) {
    // Privy not configured
    if (isDevFallbackAllowed()) {
      // Allow in development or when explicitly permitted
      console.warn(
        "Privy not configured - allowing dev fallback. " +
        "Set ALLOW_DEV_FALLBACK=true in production if this is intentional."
      );
      return { success: true, userId: "dev-user" };
    } else {
      // Fail closed in production when not explicitly allowed
      console.error(
        "Privy not configured in production. " +
        "Either configure Privy or set ALLOW_DEV_FALLBACK=true."
      );
      return { 
        success: false, 
        error: "Authentication service not configured" 
      };
    }
  }

  try {
    // Verify the token with Privy
    const verifiedClaims = await client.verifyAuthToken(authToken);
    const userId = verifiedClaims.userId;

    // Get user details to check email/wallet
    const user = await client.getUser(userId);

    const userEmail = user.email?.address?.toLowerCase();
    const userWallets = user.linkedAccounts
      .filter((a) => a.type === "wallet" && "address" in a)
      .map((w) => (w as { address: string }).address.toLowerCase());

    // Check whitelist
    const allowedEmails = getAllowedEmails();
    const allowedWallets = getAllowedWallets();

    // If no whitelist is configured, allow all authenticated users
    if (allowedEmails.length === 0 && allowedWallets.length === 0) {
      return {
        success: true,
        userId,
        email: userEmail,
        wallet: userWallets[0],
      };
    }

    // Check if user's email is in whitelist
    if (userEmail && allowedEmails.includes(userEmail)) {
      return {
        success: true,
        userId,
        email: userEmail,
      };
    }

    // Check if any of user's wallets are in whitelist
    for (const wallet of userWallets) {
      if (allowedWallets.includes(wallet)) {
        return {
          success: true,
          userId,
          wallet,
        };
      }
    }

    // User authenticated but not on whitelist
    return {
      success: false,
      error: "Your account is not authorized to use this app",
    };
  } catch (error) {
    console.error("Privy verification error:", error);
    return {
      success: false,
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
