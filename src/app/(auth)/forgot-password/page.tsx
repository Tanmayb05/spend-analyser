import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-medium">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-sm text-muted">We&apos;ll email you a link to set a new one.</p>
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        hideOnSuccess
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={
          <p className="pt-2 text-center text-sm">
            <Link href="/login" className="text-muted hover:text-text">Back to sign in</Link>
          </p>
        }
      />
    </>
  );
}
