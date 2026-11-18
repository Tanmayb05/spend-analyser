"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { MessageCircleQuestion, Send } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { askAction } from "@/app/(app)/ai/insight-actions";

type Turn = { role: "user" | "assistant"; content: string };

const EXAMPLES = ["How much did I spend on food last month?", "What were my top 5 merchants this year?", "Did my spending go up compared with 3 months ago?"];

export function AskCard({ ready, left, limit, info }: { ready: boolean; left: number; limit: number; info?: ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [remaining, setRemaining] = useState(left);
  const [pending, start] = useTransition();

  const ask = (question: string) => {
    const text = question.trim();
    if (text.length < 3 || pending) return;
    const history = turns;
    setTurns([...history, { role: "user", content: text }]);
    setQ("");
    start(async () => {
      const r = await askAction({ question: text, history });
      if (!r.ok) {
        toast.error(r.error);
        setTurns(history);
        setQ(text);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: r.answer }]);
      setRemaining(r.remaining);
    });
  };

  if (!ready) return null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessageCircleQuestion size={18} className="text-accent" /> Ask your data
          </span>
        }
        subtitle={`${remaining} of ${limit} questions left this month`}
        info={info}
      />
      {turns.length ? (
        <ul className="mb-4 space-y-3" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={cn("max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed", t.role === "user" ? "ml-auto bg-text text-bg" : "bg-surface-2")}>
              {t.content}
            </li>
          ))}
          {pending ? <li className="w-fit animate-pulse rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-muted">Looking at your numbers…</li> : null}
        </ul>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => ask(e)} disabled={pending || remaining <= 0} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-left text-xs text-muted hover:bg-surface-3">
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Input aria-label="Ask a question about your spending" placeholder="Ask about your spending…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} disabled={remaining <= 0} />
        <Button type="submit" variant="accent" size="icon" aria-label="Ask" disabled={pending || q.trim().length < 3 || remaining <= 0}>
          <Send size={16} />
        </Button>
      </form>
      <p className="mt-2 text-xs text-faint">AI answers from summaries of your data. Check important numbers on the Transactions page.</p>
    </Card>
  );
}
