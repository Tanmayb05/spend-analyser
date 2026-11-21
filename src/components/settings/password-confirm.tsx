"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/**
 * Destructive action gated by the typed word AND the current password.
 * `children` renders above the fields (e.g. a scope picker).
 */
export function PasswordConfirm({
  label,
  word = "DELETE",
  action,
  children,
}: {
  label: string;
  word?: string;
  action: (confirm: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  children?: ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await action(text, password);
          if (!r.ok) {
            setError(r.error ?? "Failed");
            return;
          }
          toast.success("Done");
          setText("");
          setPassword("");
          router.refresh();
        });
      }}
    >
      {children}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor={`${id}-pw`}>
          <Input id={`${id}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={`Type ${word} to confirm`} htmlFor={`${id}-word`}>
          <Input id={`${id}-word`} autoComplete="off" placeholder={word} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="danger" disabled={text !== word || !password || pending}>
          {pending ? "Working…" : label}
        </Button>
      </div>
    </form>
  );
}
