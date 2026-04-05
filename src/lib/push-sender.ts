import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:notifications@intake-tracker.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushResult {
  success: boolean;
  statusCode?: number;
}

/**
 * Send a push notification to a subscription.
 * Returns { success: false, statusCode: 410 } when the subscription is expired/unsubscribed.
 */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  payload: string
): Promise<PushResult> {
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL: 600,
      urgency: "high",
    });
    return { success: true };
  } catch (error: unknown) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 410) {
      return { success: false, statusCode: 410 };
    }

    console.error("[push-sender] Failed to send notification:", error);
    return { success: false, ...(statusCode !== undefined && { statusCode }) };
  }
}

export { webpush };
