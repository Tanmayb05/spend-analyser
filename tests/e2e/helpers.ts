import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const MAILPIT = "http://127.0.0.1:54324";

/** Keys come from .env.local (loaded in playwright.config.ts). E2E tests create and delete users: local only. */
export function localEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`E2E tests only run against local Supabase (got "${url}"). Point .env.local at \`supabase start\` output.`);
  }
  if (!publishable || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local");
  return { url, publishable, secret };
}

export function admin() {
  const e = localEnv();
  return createClient(e.url, e.secret, { auth: { persistSession: false } });
}

export function userClient() {
  const e = localEnv();
  return createClient(e.url, e.publishable, { auth: { persistSession: false } });
}

export async function deleteUserByEmail(email: string) {
  const a = admin();
  const { data } = await a.auth.admin.listUsers({ perPage: 1000 });
  const u = data?.users.find((x) => x.email === email);
  if (u) await a.auth.admin.deleteUser(u.id);
}

/** Creates a confirmed user directly (skips email). */
export async function createConfirmedUser(email: string, password: string, name = "Test") {
  await deleteUserByEmail(email);
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw error;
  return data.user!;
}

export async function clearMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

/** Latest email link sent to `email` that points at Supabase verify. */
export async function latestLink(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages: { ID: string }[] };
    if (list.messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const m = (msg.HTML || msg.Text).match(/href="([^"]+verify[^"]+)"/) ?? msg.Text.match(/(http\S+verify\S+)/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${email}`);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { buildBundle } from "../../src/lib/import/workbook";

/** Signs in with supabase-js and imports the workbook through the same RPC the UI uses. */
export async function importWorkbookAs(email: string, password: string, file = "Expense_Tracker.xlsx") {
  const sb = userClient();
  await sb.auth.signInWithPassword({ email, password });
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const rows = (n: string) => XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[n], { header: 1, raw: true, defval: null });
  const { bundle } = buildBundle({ settings: rows("Settings"), expenses: rows("Expenses") });
  const { error } = await sb.rpc("import_bundle", { p: bundle });
  if (error) throw error;
  return sb;
}
