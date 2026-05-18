import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { savePushSubscription } from "@/lib/push-db";
import { parseJsonBody, zodErrorResponse } from "../../_shared/validation";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
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
