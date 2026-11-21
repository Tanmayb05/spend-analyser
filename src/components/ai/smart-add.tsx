"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Receipt } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { useSpeech } from "@/hooks/use-speech";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseTextAction, type TxnPreset } from "@/app/(app)/ai/actions";

/** "Describe it" box: text or voice → LLM → prefilled transaction(s). */
export function SmartAdd({ onPresets, onReceipt }: { onPresets: (p: TxnPreset[], note: string | null) => void; onReceipt: () => void }) {
  const app = useAppData();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const run = (t: string) =>
    start(async () => {
      const res = await parseTextAction(t);
      if (!res.ok) return void toast.error(res.error);
      if (!res.presets.length) return void toast.message("Couldn't find a transaction in that. Try adding an amount.");
      onPresets(res.presets, res.note);
      setText("");
    });
  const speech = useSpeech((t, final) => {
    setText(t);
    if (final && t.trim()) run(t);
  });

  if (!app.aiReady) return null;

  return (
    <div className="rounded-card border border-border bg-surface-2 p-compact">
      {/* A div, not a <form>: this renders inside the transaction form, and forms can't nest. */}
      <div className="flex items-center gap-2">
        <input
          aria-label="Describe a transaction"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault(); // don't submit the outer transaction form
            if (text.trim() && !pending) run(text);
          }}
          placeholder={speech.listening ? "Listening…" : "e.g. 12.50 Kroger groceries yesterday"}
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
          disabled={pending}
        />
        {speech.supported ? (
          <button
            type="button"
            onClick={speech.toggle}
            aria-label={speech.listening ? "Stop listening" : "Speak"}
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control transition-colors", speech.listening ? "bg-surface-3 text-bad" : "text-muted hover:bg-surface-3")}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        ) : null}
        <button type="button" onClick={onReceipt} aria-label="Read a receipt" className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-3">
          <Receipt size={18} />
        </button>
        <Button size="sm" onClick={() => text.trim() && run(text)} disabled={!text.trim() || pending}>
          {pending ? "Reading…" : "Fill"}
        </Button>
      </div>
      <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
        Type{speech.supported ? " or say" : ""} what you spent (amount, place, when) and press Fill. The form below is completed for you to check before saving. Several entries at once work too. The receipt icon reads a bill.
      </p>
    </div>
  );
}
