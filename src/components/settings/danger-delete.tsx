"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** Type-to-confirm destructive action. */
export function TypeToConfirm({ label, action, word = "DELETE" }: { label: string; action: (confirm: string) => Promise<{ ok: boolean; error?: string }>; word?: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input aria-label={`Type ${word} to confirm`} placeholder={`Type ${word}`} value={text} onChange={(e) => setText(e.target.value)} className="sm:max-w-48" />
      <Button
        variant="danger"
        disabled={text !== word || pending}
        onClick={() =>
          start(async () => {
            const r = await action(text);
            if (!r.ok) return void toast.error(r.error ?? "Failed");
            toast.success("Done");
            setText("");
            router.refresh();
          })
        }
      >
        {pending ? "Working…" : label}
      </Button>
    </div>
  );
}
