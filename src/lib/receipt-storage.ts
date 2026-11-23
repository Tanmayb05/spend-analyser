import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKETS = ["receipts", "trip-covers"] as const;
const PAGE = 100;

type Storage = Pick<SupabaseClient, "storage">;

/** Every file path under `<prefix>/`, recursing into folders (e.g. `<uid>/uploads/`). Paginated. */
async function listFiles(client: Storage, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const entry of data) {
      // folders come back without an id; files have one
      if (entry.id) out.push(`${prefix}/${entry.name}`);
      else out.push(...(await listFiles(client, bucket, `${prefix}/${entry.name}`)));
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Delete all of a user's stored files (receipts, including `uploads/`, and trip cover photos). Lists storage itself rather than the
 * `receipts` table so it still works after the rows are gone. Returns how many files were removed.
 * Pass the service-role client.
 */
export async function removeUserReceipts(client: Storage, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of BUCKETS) {
    const paths = await listFiles(client, bucket, userId);
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(i, i + PAGE));
      if (error) throw new Error(error.message);
    }
    removed += paths.length;
  }
  return removed;
}
