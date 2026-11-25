"use client";

import { Fragment } from "react";
import { useShortcuts } from "@/components/shortcuts/shortcuts-provider";
import { chordKeys, chordsOf } from "@/lib/shortcuts/keys";
import { cn } from "@/lib/utils";

/** One key cap: hairline border, mono, no shadow. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-grid h-5 min-w-5 place-items-center rounded-sm border border-border bg-surface-2 px-1 font-mono text-xs leading-none font-medium text-muted", className)}>
      {children}
    </kbd>
  );
}

/** A binding drawn as key caps for this OS: "⌘ K", "Ctrl K", "G then T". */
export function Keys({ binding, className }: { binding: string; className?: string }) {
  const { platform } = useShortcuts();
  const chords = chordsOf(binding);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      {chords.map((c, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="text-xs text-faint">then</span> : null}
          {chordKeys(c, platform).map((k, j) => (
            <Kbd key={j}>{k}</Kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The live shortcut for a command, as key caps. Renders nothing when the command has none (removed, or character keys off)
 * and stays hidden on touch screens, where there's no keyboard to press it with.
 */
export function ShortcutHint({ id, className }: { id: string; className?: string }) {
  const { active, bindings } = useShortcuts();
  if (!active(id)) return null;
  return <Keys binding={bindings[id]} className={cn("hidden pointer-fine:inline-flex", className)} />;
}
