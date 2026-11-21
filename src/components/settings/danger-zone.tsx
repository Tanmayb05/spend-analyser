"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PasswordConfirm } from "./password-confirm";
import { resetAccount } from "@/app/(app)/settings/reset/actions";
import { deleteAccount } from "@/app/(app)/settings/actions";

type Scope = "data" | "all" | "account";

const OPTIONS: { value: Scope; title: string; desc: string; word: string; button: string; severe?: boolean }[] = [
  {
    value: "data",
    title: "Wipe data only",
    desc: "Removes transactions, plans, receipts and their files, merchants, trips, card payments and AI insights. Categories, budgets, payment methods and people stay.",
    word: "RESET",
    button: "Wipe data",
  },
  {
    value: "all",
    title: "Wipe data and setup",
    desc: "Also removes budgets, categories, payment methods and people, then restores the defaults you got at signup.",
    word: "RESET",
    button: "Wipe data and setup",
  },
  {
    value: "account",
    title: "Delete account",
    desc: "Permanently deletes your login, every transaction, budget, receipt file and setting. You will be signed out and can't get anything back.",
    word: "DELETE",
    button: "Delete my account",
    severe: true,
  },
];

/** One control for the three destructive actions. Each asks for the current password and a typed word. */
export function DangerZone() {
  const [scope, setScope] = useState<Scope>("data");
  const option = OPTIONS.find((o) => o.value === scope)!;
  const action = (confirm: string, password: string) =>
    scope === "account" ? deleteAccount(confirm, password) : resetAccount(confirm, password, scope);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">What to wipe or delete</legend>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-control border border-border bg-surface-2 p-compact transition-colors hover:bg-surface-3",
              scope === o.value && "bg-surface-3 ring-1 ring-inset ring-text/10",
            )}
          >
            <input type="radio" name="danger-scope" value={o.value} checked={scope === o.value} onChange={() => setScope(o.value)} className="mt-1 accent-[var(--accent)]" />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{o.title}</span>
              <span className={cn("text-xs", o.severe ? "text-bad" : "text-muted")}>{o.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {/* key resets the typed word, password and error when the option changes */}
      <PasswordConfirm key={scope} word={option.word} label={option.button} action={action} />
    </div>
  );
}
