"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type R = { ok: true; message?: string } | { ok: false; error: string };

/** Runs a server action with a toast and router refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<R>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      onOk?.();
      router.refresh();
    });
  return { pending, run };
}
