import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-medium">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Free and open source. Your data stays yours.</p>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        hideOnSuccess
        fields={[
          { name: "name", label: "Name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "8+ characters with upper, lower case and a number" },
          { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password" },
        ]}
        footer={
          <p className="pt-2 text-center text-sm text-muted">
            Already have an account? <Link href="/login" className="text-accent">Sign in</Link>
          </p>
        }
      />
    </>
  );
}
