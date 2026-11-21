import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";
import { safeNext } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <>
      <h1 className="mb-6 text-2xl font-medium">Log in</h1>
      {sp.error === "link" ? (
        <p className="mb-4 rounded-inset bg-warn/10 px-4 py-3 text-sm text-warn">That link is invalid or expired. Try again.</p>
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
            <Link href="/forgot-password" className="text-muted transition-colors hover:text-text">Forgot password?</Link>
            <Link href="/signup" className="text-accent hover:underline">Create account</Link>
          </div>
        }
      />
    </>
  );
}
