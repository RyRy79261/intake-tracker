import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { savePushSubscription } from "@/lib/push-db";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";

const SubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  // The device's IANA zone. Optional for older clients; when absent the
  // stored zone is kept rather than reset to UTC.
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone")
    .optional(),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;

    const parsed = SubscribeSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Push subscribe request failed", parsed.error);
    }

    await savePushSubscription(auth.userId!, parsed.data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[push/subscribe] Error:", error);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
});
