import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";
import { safeNext } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <>
      <h1 className="text-2xl font-medium">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to see your spending.</p>
      {sp.error === "link" ? (
        <p className="mb-4 rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn">That link is invalid or expired. Try again.</p>
      ) : null}
      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        hidden={{ next }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <div className="flex flex-wrap justify-between gap-2 pt-2 text-sm">
            <Link href="/forgot-password" className="text-muted hover:text-text">Forgot password?</Link>
            <Link href="/signup" className="text-accent">Create account</Link>
          </div>
        }
      />
    </>
  );
}
