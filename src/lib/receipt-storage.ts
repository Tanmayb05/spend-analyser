import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "receipts";
const PAGE = 100;

type Storage = Pick<SupabaseClient, "storage">;

/** Every file path under `<prefix>/`, recursing into folders (e.g. `<uid>/uploads/`). Paginated. */
async function listFiles(client: Storage, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const entry of data) {
      // folders come back without an id; files have one
      if (entry.id) out.push(`${prefix}/${entry.name}`);
      else out.push(...(await listFiles(client, `${prefix}/${entry.name}`)));
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Delete all of a user's receipt files, including `uploads/`. Lists storage itself rather than the
 * `receipts` table so it still works after the rows are gone. Returns how many files were removed.
 * Pass the service-role client.
 */
export async function removeUserReceipts(client: Storage, userId: string): Promise<number> {
  const paths = await listFiles(client, userId);
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await client.storage.from(BUCKET).remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(error.message);
  }
  return paths.length;
}
