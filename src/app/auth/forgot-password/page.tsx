import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "../forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
