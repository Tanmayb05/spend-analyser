import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Re-check the signed-in user's password before a destructive action.
 * Uses a throwaway client so the user's session cookies are untouched.
 * Returns true only if the credentials are valid AND belong to `userId`.
 * Brute force is limited by Supabase auth's own sign-in rate limit.
 */
export async function verifyPassword(email: string, password: string, userId: string): Promise<boolean> {
  if (!email || !password) return false;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || data.user?.id !== userId) return false;
  // end the throwaway session so it does not linger server side
  await client.auth.signOut({ scope: "local" });
  return true;
}
