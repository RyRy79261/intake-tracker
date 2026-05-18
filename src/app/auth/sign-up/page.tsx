import { AuthShell } from "../auth-shell";
import { SignUpForm } from "../sign-up-form";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUpForm />
    </AuthShell>
  );
}
