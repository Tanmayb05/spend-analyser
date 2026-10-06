"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  fieldErrors,
  resetSchema,
  safeNext,
  signInSchema,
  signUpSchema,
  type FormState,
} from "@/lib/validation/auth";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const msg = error.code === "email_not_confirmed" ? "Confirm your email first. Check your inbox." : "Wrong email or password.";
    return { message: msg, values };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/`,
    },
  });
  if (error) {
    const msg = error.code === "weak_password" ? "Choose a stronger password." : error.message;
    return { message: msg, values };
  }
  // Email confirmation disabled → session exists immediately.
  if (data.session) redirect("/");
  return { ok: true, message: `We sent a confirmation link to ${parsed.data.email}.` };
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { errors: { email: "Enter a valid email" }, values: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Rate limits are per project/IP, not per account, so surfacing them reveals nothing.
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit") {
    return { message: "Too many emails sent recently. Wait a few minutes and try again.", values: { email: parsed.data } };
  }
  if (error) console.error("resetPasswordForEmail", error.code, error.message);
  // Same response whether or not the account exists (no account enumeration).
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const msg = error.code === "same_password" ? "New password must differ from the old one." : error.message;
    return { message: msg };
  }
  return { ok: true, message: "Password updated." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
