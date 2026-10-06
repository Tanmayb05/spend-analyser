"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Receipt, Sparkles } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { useSpeech } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";
import { parseTextAction, type TxnPreset } from "@/app/(app)/ai/actions";

/** "Describe it" box: text or voice → Gemini → prefilled transaction(s). */
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
    <div className="rounded-3xl border border-border bg-surface-2 p-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text);
        }}
      >
        <Sparkles size={18} className="ml-1 shrink-0 text-accent" />
        <input
          aria-label="Describe a transaction"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={speech.listening ? "Listening…" : "e.g. 12.50 Kroger groceries yesterday"}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          disabled={pending}
        />
        {speech.supported ? (
          <button
            type="button"
            onClick={speech.toggle}
            aria-label={speech.listening ? "Stop listening" : "Speak"}
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", speech.listening ? "bg-bad/20 text-bad" : "text-muted hover:bg-surface-3")}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        ) : null}
        <button type="button" onClick={onReceipt} aria-label="Read a receipt" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3">
          <Receipt size={18} />
        </button>
        <button type="submit" disabled={!text.trim() || pending} className="h-9 shrink-0 rounded-full bg-text px-3 text-sm font-medium text-bg disabled:opacity-40">
          {pending ? "…" : "Fill"}
        </button>
      </form>
      <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted">
        Type{speech.supported ? " or say" : ""} what you spent (amount, place, when) and tap Fill. AI fills the form below for you to check before saving. Several at once works too. The receipt icon reads a bill.
      </p>
    </div>
  );
}
