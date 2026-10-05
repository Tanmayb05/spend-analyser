"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

type FieldDef = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden,
  footer,
  hideOnSuccess,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: FieldDef[];
  submitLabel: string;
  hidden?: Record<string, string>;
  footer?: ReactNode;
  hideOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.ok && hideOnSuccess) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-good/10 px-4 py-3 text-sm text-good">{state.message}</p>
        {footer}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <Field key={f.name} label={f.label} htmlFor={f.name} error={state.errors?.[f.name]} hint={f.hint}>
          <Input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={state.values?.[f.name]}
            aria-invalid={Boolean(state.errors?.[f.name])}
            required
          />
        </Field>
      ))}
      {state.message ? (
        <p role="status" className={cn("rounded-2xl px-4 py-3 text-sm", state.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad")}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </Button>
      {footer}
    </form>
  );
}
