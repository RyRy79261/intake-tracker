import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { syncDoseSchedules, updateTimezone } from "@/lib/push-db";

const SyncScheduleSchema = z.object({
  schedules: z.array(
    z.object({
      timeSlot: z.string().regex(/^\d{2}:\d{2}$/),
      dayOfWeek: z.number().int().min(0).max(6),
      medicationsJson: z.string().min(1),
    })
  ),
  timezone: z.string().min(1).optional(),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();

    const parsed = SyncScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await syncDoseSchedules(auth.userId!, parsed.data.schedules);

    if (parsed.data.timezone) {
      await updateTimezone(auth.userId!, parsed.data.timezone);
    }

    return NextResponse.json({ ok: true, count: parsed.data.schedules.length });
  } catch (error) {
    console.error("[push/sync-schedule] Error:", error);
    return NextResponse.json(
      { error: "Failed to sync schedules" },
      { status: 500 }
    );
  }
});
