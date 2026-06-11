"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/app/auth/auth-shell";
import { ResetPasswordForm } from "@/app/auth/reset-password-form";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? null;
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <ResetPasswordContent />
      </Suspense>
    </AuthShell>
  );
}
