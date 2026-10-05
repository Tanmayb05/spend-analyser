"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/hooks/use-action";
import { changePassword, signOutEverywhere, updateEmail, updateProfile } from "@/app/(app)/settings/actions";

export function ProfileForms({ name, email }: { name: string; email: string }) {
  const [n, setN] = useState(name);
  const [e, setE] = useState(email);
  const a = useAction();
  return (
    <>
      <Card>
        <CardHeader title="Your name" />
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(ev) => { ev.preventDefault(); a.run(() => updateProfile(n)); }}>
          <Field label="Display name" htmlFor="dn" className="flex-1">
            <Input id="dn" value={n} onChange={(x) => setN(x.target.value)} autoComplete="name" />
          </Field>
          <Button type="submit" disabled={a.pending || n === name}>Save</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Email" subtitle="We'll send a confirmation link to both the old and new address." />
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(ev) => { ev.preventDefault(); a.run(() => updateEmail(e)); }}>
          <Field label="Email" htmlFor="em" className="flex-1">
            <Input id="em" type="email" value={e} onChange={(x) => setE(x.target.value)} autoComplete="email" />
          </Field>
          <Button type="submit" disabled={a.pending || e === email}>Change email</Button>
        </form>
      </Card>
    </>
  );
}

export function PasswordForm() {
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const a = useAction();
  return (
    <Card>
      <CardHeader title="Change password" subtitle="8+ characters with upper, lower case and a number. Stored only as a secure hash by Supabase Auth." />
      <form
        className="space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          a.run(() => changePassword(p, c), () => { setP(""); setC(""); });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" htmlFor="np">
            <Input id="np" type="password" value={p} onChange={(x) => setP(x.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" htmlFor="cp">
            <Input id="cp" type="password" value={c} onChange={(x) => setC(x.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" disabled={a.pending || !p}>Update password</Button>
      </form>
    </Card>
  );
}

export function SignOutAll() {
  return (
    <Card>
      <CardHeader title="Sign out everywhere" subtitle="Ends every session on all your devices, including this one." />
      <form action={signOutEverywhere}>
        <Button type="submit" variant="outline">Sign out of all devices</Button>
      </form>
    </Card>
  );
}
