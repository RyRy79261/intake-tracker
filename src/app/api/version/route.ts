import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0",
    gitSha: process.env.NEXT_PUBLIC_GIT_SHA || "local",
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  });
}
