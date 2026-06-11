import { AuthShell } from "@/app/auth/auth-shell";
import { ForgotPasswordForm } from "@/app/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
