"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Keys } from "@/components/ui/kbd";
import { useShortcuts } from "./shortcuts-provider";
import { BUILT_IN, COMMANDS, GROUP_ORDER } from "@/lib/shortcuts/commands";
import { isCharacterBinding } from "@/lib/shortcuts/keys";

/** "?" opens this: every shortcut for this device's keyboard, grouped, with a link to change them. */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bindings, characterKeys } = useShortcuts();

  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts" className="sm:max-w-2xl">
      {!characterKeys ? (
        <p className="mb-4 rounded-inset border border-border bg-surface-2 p-3 text-sm text-muted">
          Single-key shortcuts are off, so only the ones with a modifier key work. Turn them back on in Settings
        </p>
      ) : null}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {GROUP_ORDER.map((group) => (
          <section key={group} aria-label={group}>
            <h3 className="text-label mb-1 text-muted">{group}</h3>
            <ul className="divide-y divide-border">
              {COMMANDS.filter((c) => c.group === group).map((c) => {
                const b = bindings[c.id];
                const off = !b || (!characterKeys && isCharacterBinding(b));
                return (
                  <li key={c.id} className="flex min-h-10 items-center justify-between gap-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className={off ? "text-faint" : "text-text"}>{c.label}</span>
                      {c.where ? <span className="block text-xs text-faint">{c.where}</span> : null}
                    </span>
                    {off ? <span className="shrink-0 text-xs text-faint">{b ? "Off" : "None"}</span> : <Keys binding={b} className="shrink-0" />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section aria-label="Always on">
          <h3 className="text-label mb-1 text-muted">Always on</h3>
          <ul className="divide-y divide-border">
            {BUILT_IN.map((b) => (
              <li key={b.label} className="flex min-h-10 items-center justify-between gap-3 py-2">
                <span className="text-sm">{b.label}</span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {b.keys.map((k, i) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      {i > 0 ? <span className="text-xs text-faint">/</span> : null}
                      <Keys binding={k} />
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pb-card pt-4">
        <p className="text-xs text-faint">Shortcuts don&apos;t fire while you type in a field, except ones with a modifier key</p>
        <Link href="/settings/shortcuts" onClick={onClose} className="shrink-0 text-sm font-medium text-accent hover:underline">
          Change shortcuts
        </Link>
      </div>
    </Sheet>
  );
}
