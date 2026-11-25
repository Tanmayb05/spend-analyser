"use client";

import { toast } from "sonner";
import { deleteTransactions, restoreTransactions } from "@/app/(app)/transactions/actions";
import { showUndoToast } from "@/components/vendor/kokonut/undo-toast";

/**
 * Deletes transactions and shows a toast with Undo (restores the snapshot the delete returned).
 * Returns false (after an error toast) when the delete failed, so callers can roll back their UI.
 */
export async function deleteWithUndo(ids: string[], refresh: () => void, message = "Deleted"): Promise<boolean> {
  const res = await deleteTransactions(ids);
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  refresh();
  showUndoToast(message, async () => {
    const r = await restoreTransactions(res.data);
    if (r.ok) refresh();
    else toast.error(r.error);
  });
  return true;
}
