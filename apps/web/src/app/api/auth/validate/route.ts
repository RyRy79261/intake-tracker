import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

export const GET = withAuth(async ({ auth }) => {
  return NextResponse.json({
    user: { id: auth.userId, email: auth.email },
    session: { userId: auth.userId },
  });
});
