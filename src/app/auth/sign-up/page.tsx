import { AuthShell } from "@/app/auth/auth-shell";
import { SignUpForm } from "@/app/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUpForm />
    </AuthShell>
  );
}
