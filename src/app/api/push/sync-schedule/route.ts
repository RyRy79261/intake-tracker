import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { syncDoseSchedules } from "@/lib/push-db";
import { parseJsonBody, zodErrorResponse } from "../../_shared/validation";

const SyncScheduleSchema = z.object({
  schedules: z.array(
    z.object({
      timeSlot: z.string().regex(/^\d{2}:\d{2}$/),
      dayOfWeek: z.number().int().min(0).max(6),
      medicationsJson: z.string().min(1),
    })
  ),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;

    const parsed = SyncScheduleSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Push sync-schedule request failed", parsed.error);
    }

    await syncDoseSchedules(auth.userId!, parsed.data.schedules);

    return NextResponse.json({ ok: true, count: parsed.data.schedules.length });
  } catch (error) {
    console.error("[push/sync-schedule] Error:", error);
    return NextResponse.json(
      { error: "Failed to sync schedules" },
      { status: 500 }
    );
  }
});
