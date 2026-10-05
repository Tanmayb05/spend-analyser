import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { updatePassword } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-[28px] border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-medium">Set a new password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Choose a strong password you don&apos;t use elsewhere.</p>
        <AuthForm
          action={updatePassword}
          submitLabel="Update password"
          hideOnSuccess
          fields={[
            { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "8+ characters with upper, lower case and a number" },
            { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password" },
          ]}
          footer={<Link href="/" className="text-sm text-accent">Go to dashboard →</Link>}
        />
      </div>
    </div>
  );
}
