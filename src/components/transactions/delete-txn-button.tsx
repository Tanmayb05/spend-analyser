"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTransactions, restoreTransactions } from "@/app/(app)/transactions/actions";
import { cn } from "@/lib/utils";

/** Two-tap delete with an Undo toast, for the detail sheets. The first tap arms it, the second deletes; it disarms itself after a few seconds. */
export function DeleteTxnButton({ txnId, what = "transaction", onDeleted }: { txnId: string; what?: string; onDeleted: () => void }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function remove() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteTransactions([txnId]);
      if (!res.ok) return void toast.error(res.error);
      onDeleted();
      router.refresh();
      toast("Deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            const r = await restoreTransactions(res.data);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          },
        },
      });
    });
  }

  return (
    <Button
      variant="danger"
      size="icon"
      disabled={pending}
      onClick={remove}
      aria-label={armed ? `Tap again to delete this ${what}` : `Delete ${what}`}
      title={`Delete ${what}`}
      className={cn(armed && "w-auto px-4")}
    >
      <Trash2 size={18} />
      {armed ? "Tap again" : null}
    </Button>
  );
}
