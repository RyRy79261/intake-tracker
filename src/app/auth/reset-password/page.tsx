"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "../reset-password-form";

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
