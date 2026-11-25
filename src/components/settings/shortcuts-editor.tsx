"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Keys } from "@/components/ui/kbd";
import { useShortcuts } from "@/components/shortcuts/shortcuts-provider";
import { BUILT_IN, COMMANDS, GROUP_ORDER, clashesWith, diffFromDefaults, type Command } from "@/lib/shortcuts/commands";
import { bindingProblem, chordFromEvent, isCharacterBinding, isCharacterChord } from "@/lib/shortcuts/keys";
import { updateShortcuts } from "@/app/(app)/settings/actions";
import { cn } from "@/lib/utils";

/** After a plain first key, how long to wait for an optional second key (G then T). */
const SECOND_KEY_MS = 1000;

type Settings = { bindings: Record<string, string>; characterKeys: boolean };
type Clash = { id: string; binding: string; with: Command[] };

export function ShortcutsEditor() {
  const ctx = useShortcuts();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setOptimistic] = useOptimistic<Settings, Settings>({ bindings: ctx.bindings, characterKeys: ctx.characterKeys }, (_, next) => next);
  const [recording, setRecording] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const changed = Object.keys(diffFromDefaults(view.bindings)).length > 0;

  const save = (next: Settings) =>
    start(async () => {
      setOptimistic(next);
      const r = await updateShortcuts({ overrides: diffFromDefaults(next.bindings), characterKeys: next.characterKeys });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });

  const setBinding = (id: string, binding: string, extra: Record<string, string> = {}) => save({ ...view, bindings: { ...view.bindings, ...extra, [id]: binding } });

  /** A finished recording: check it, then save or ask about the clash. */
  const recorded = (id: string, binding: string) => {
    setRecording(null);
    const problem = bindingProblem(binding);
    if (problem) return setError({ id, text: problem });
    const others = clashesWith(view.bindings, id, binding);
    if (others.length) return setClash({ id, binding, with: others });
    setBinding(id, binding);
  };

  return (
    <div className="space-y-4">
      <Card>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            checked={view.characterKeys}
            disabled={pending}
            onChange={(e) => save({ ...view, characterKeys: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium text-text">Single-key shortcuts</span>
            <span className="block text-xs text-faint">
              Shortcuts that are one plain key, like N or G then T. Turn them off if you use speech input or press keys by accident;
              shortcuts with {ctx.platform === "mac" ? "⌘ or ⌥" : "Ctrl or Alt"} keep working
            </span>
          </span>
        </label>
      </Card>

      {GROUP_ORDER.map((group) => (
        <Card key={group}>
          <CardHeader
            title={group}
            action={
              group === "General" && changed ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => save({ ...view, bindings: Object.fromEntries(COMMANDS.map((c) => [c.id, c.default])) })}>
                  Reset all
                </Button>
              ) : undefined
            }
          />
          <ul className="-mx-2 divide-y divide-border border-t border-border">
            {COMMANDS.filter((c) => c.group === group).map((c) => (
              <ShortcutRow
                key={c.id}
                command={c}
                binding={view.bindings[c.id]}
                off={!view.characterKeys && isCharacterBinding(view.bindings[c.id])}
                recording={recording === c.id}
                busy={pending}
                onRecord={() => {
                  setError(null);
                  setClash(null);
                  setRecording(c.id);
                }}
                onCancel={() => setRecording(null)}
                onRecorded={(b) => recorded(c.id, b)}
                onRemove={() => {
                  setRecording(null);
                  setBinding(c.id, "");
                }}
                onReset={() => {
                  setError(null);
                  const others = clashesWith(view.bindings, c.id, c.default);
                  if (others.length) setClash({ id: c.id, binding: c.default, with: others });
                  else setBinding(c.id, c.default);
                }}
              >
                {error?.id === c.id ? <p className="text-sm text-bad">{error.text}</p> : null}
                {clash?.id === c.id ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-inset border border-border bg-surface-2 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <Keys binding={clash.binding} /> is already used by {clash.with.map((w) => w.label).join(" and ")}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBinding(clash.id, clash.binding, Object.fromEntries(clash.with.map((w) => [w.id, ""])));
                        setClash(null);
                      }}
                    >
                      Use it here instead
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setClash(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </ShortcutRow>
            ))}
          </ul>
        </Card>
      ))}

      <Card>
        <CardHeader title="Always on" subtitle="Standard keys that work everywhere and can't be changed" />
        <ul className="-mx-2 divide-y divide-border border-t border-border">
          {BUILT_IN.map((b) => (
            <li key={b.label} className="flex min-h-12 items-center justify-between gap-3 px-2 py-2">
              <span className="text-sm">{b.label}</span>
              <span className="flex flex-wrap justify-end gap-1">
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
        <p className="mt-4 text-xs text-faint">
          Keys are shown for this device ({ctx.platform === "mac" ? "Mac" : "Windows or Linux"}). The same shortcuts work on the other:{" "}
          {ctx.platform === "mac" ? "⌘ becomes Ctrl" : "Ctrl becomes ⌘ on a Mac"}
        </p>
      </Card>
    </div>
  );
}

function ShortcutRow({
  command,
  binding,
  off,
  recording,
  busy,
  onRecord,
  onCancel,
  onRecorded,
  onRemove,
  onReset,
  children,
}: {
  command: Command;
  binding: string;
  off: boolean;
  recording: boolean;
  busy: boolean;
  onRecord: () => void;
  onCancel: () => void;
  onRecorded: (binding: string) => void;
  onRemove: () => void;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  const { platform } = useShortcuts();
  const [steps, setSteps] = useState<string[]>([]);
  const changeBtn = useRef<HTMLButtonElement>(null);
  const done = useRef(onRecorded);
  const cancel = useRef(onCancel);
  useEffect(() => {
    done.current = onRecorded;
    cancel.current = onCancel;
  });

  // while recording, every key press is captured here first, so no shortcut fires and nothing else reacts
  useEffect(() => {
    if (!recording) return;
    const got: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      done.current(got.join(" "));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !got.length) return; // let Tab leave, so the keyboard is never trapped
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape" && !got.length) {
        cancel.current();
        return;
      }
      if (e.repeat) return;
      const chord = chordFromEvent(e, platform);
      if (!chord) return;
      got.push(chord);
      setSteps([...got]);
      // a plain first key may be followed by a second (G then T); anything else is complete
      if (got.length === 1 && isCharacterChord(chord)) timer = setTimeout(finish, SECOND_KEY_MS);
      else finish();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, { capture: true });
      setSteps([]);
    };
  }, [recording, platform]);

  // the Change button is back once recording ends; return focus to it so a keyboard user stays on this row
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recording) changeBtn.current?.focus();
    wasRecording.current = recording;
  }, [recording]);

  const isDefault = binding === command.default;
  return (
    <li className="px-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", off ? "text-faint" : "text-text")}>{command.label}</span>
          {command.where ? <span className="block text-xs text-faint">{command.where}</span> : null}
        </span>
        <span className="flex min-h-9 items-center gap-2" aria-live="polite">
          {recording ? (
            steps.length ? (
              <Keys binding={steps.join(" ")} />
            ) : (
              <span className="text-sm text-accent">Press the new keys</span>
            )
          ) : binding ? (
            <>
              <Keys binding={binding} />
              {off ? <span className="text-xs text-faint">Off</span> : null}
            </>
          ) : (
            <span className="text-sm text-faint">None</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {recording ? (
            <>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {!isDefault ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={onReset} title={`Back to ${command.default || "none"}`}>
                  Reset
                </Button>
              ) : null}
              <Button ref={changeBtn} variant="outline" size="sm" disabled={busy} onClick={onRecord} aria-label={`Change shortcut for ${command.label}`}>
                Change
              </Button>
            </>
          )}
        </span>
      </div>
      {recording ? <p className="mt-2 text-xs text-faint">A plain key can be followed by a second one. Esc cancels</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </li>
  );
}
