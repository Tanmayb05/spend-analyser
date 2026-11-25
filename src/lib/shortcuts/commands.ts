/**
 * Every rebindable shortcut, declared once. The help sheet, the command menu, Settings → Keyboard shortcuts
 * and the key handler all read this list, so they can't drift apart.
 *
 * A command runs one of two ways:
 * - `target`: the shortcut presses (or focuses) the first visible element marked `data-shortcut="<target>"`.
 *   Pages opt in by tagging a button; nothing else to wire. The shortcut does nothing where no such element is shown.
 * - otherwise a component registers a handler with `useShortcut(id, fn)` (global ones live in the shortcuts provider).
 */
import { bindingProblem, bindingsClash, normalizeBinding } from "./keys";

export type CommandGroup = "General" | "Go to" | "Lists" | "Transactions";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Default binding; "" for none. */
  default: string;
  /** Where it works, when that's not everywhere. */
  where?: string;
  target?: { name: string; action: "click" | "focus" };
  /** Hold the key down to repeat (list movement). */
  repeat?: boolean;
  /** Modifier shortcuts normally work while typing; these don't, because the browser's own meaning wins there (⌘A selects text). */
  notInInputs?: boolean;
};

/** Pages reachable with "g" then a letter. Kept beside NAV's hrefs (src/components/shell/nav.ts). */
export const GO_TO: { id: string; label: string; href: string; key: string }[] = [
  { id: "go.overview", label: "Overview", href: "/", key: "o" },
  { id: "go.transactions", label: "Transactions", href: "/transactions", key: "t" },
  { id: "go.trips", label: "Trips", href: "/trips", key: "r" },
  { id: "go.items", label: "Items", href: "/items", key: "i" },
  { id: "go.insights", label: "Insights", href: "/insights", key: "n" },
  { id: "go.plans", label: "Plans", href: "/transactions?tab=plans", key: "p" },
  { id: "go.settings", label: "Settings", href: "/settings", key: "s" },
];

export const COMMANDS: Command[] = [
  { id: "palette.open", label: "Open the command menu", group: "General", default: "$mod+k" },
  { id: "help.open", label: "Show keyboard shortcuts", group: "General", default: "?" },
  { id: "txn.new", label: "Add a transaction", group: "General", default: "n" },
  { id: "search.focus", label: "Search", group: "General", default: "/", where: "Transactions; elsewhere it opens the command menu" },

  ...GO_TO.map((g) => ({ id: g.id, label: `Go to ${g.label}`, group: "Go to" as const, default: `g ${g.key}` })),

  { id: "list.next", label: "Next row", group: "Lists", default: "j", repeat: true, where: "Any list; ↓ also works on a focused row" },
  { id: "list.prev", label: "Previous row", group: "Lists", default: "k", repeat: true, where: "Any list; ↑ also works on a focused row" },
  { id: "period.prev", label: "Previous month or year", group: "Lists", default: "[", target: { name: "period-prev", action: "click" }, where: "Pages with a month picker" },
  { id: "period.next", label: "Next month or year", group: "Lists", default: "]", target: { name: "period-next", action: "click" }, where: "Pages with a month picker" },

  { id: "select.start", label: "Select entries", group: "Transactions", default: "s", target: { name: "select-start", action: "click" }, where: "Transactions list" },
  { id: "select.toggle", label: "Select or clear the focused entry", group: "Transactions", default: "x", where: "While selecting" },
  { id: "select.all", label: "Select all entries", group: "Transactions", default: "$mod+a", notInInputs: true, where: "While selecting" },
  { id: "select.delete", label: "Delete selected entries", group: "Transactions", default: "$mod+backspace", notInInputs: true, where: "While selecting; you can undo" },
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export const GROUP_ORDER: CommandGroup[] = ["General", "Go to", "Lists", "Transactions"];

/** Keys that work without a setting. Shown in the help sheet and settings so people know they exist. */
export const BUILT_IN: { label: string; keys: string[] }[] = [
  { label: "Move between controls", keys: ["tab", "shift+tab"] },
  { label: "Open or press the focused item", keys: ["enter", "space"] },
  { label: "Move through a focused list", keys: ["arrowdown", "arrowup", "home", "end"] },
  { label: "Switch tabs on Transactions and Insights", keys: ["1", "2", "3", "4"] },
  { label: "Close a sheet, menu or selection", keys: ["escape"] },
];

export type Overrides = Record<string, string>;

/** Overrides from the database, cleaned: unknown ids and invalid bindings are dropped. */
export function parseOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Overrides = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!COMMAND_BY_ID.has(id) || typeof v !== "string") continue;
    const n = normalizeBinding(v);
    if (n !== null) out[id] = n;
  }
  return out;
}

/** The binding in force for every command: the user's override, else the default. */
export function resolveBindings(overrides: Overrides): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COMMANDS) out[c.id] = c.id in overrides ? overrides[c.id] : c.default;
  return out;
}

/** Other commands whose binding clashes with `binding` (same keys, or one starts the other). */
export function clashesWith(bindings: Record<string, string>, id: string, binding: string): Command[] {
  return COMMANDS.filter((c) => c.id !== id && bindingsClash(bindings[c.id], binding));
}

/**
 * Checks a full set of overrides before saving: every binding valid and no two commands sharing keys.
 * Returns the first problem as a sentence, or null.
 */
export function validateOverrides(overrides: Overrides): string | null {
  for (const [id, b] of Object.entries(overrides)) {
    const c = COMMAND_BY_ID.get(id);
    if (!c) return "Unknown shortcut";
    const p = bindingProblem(b);
    if (p) return `${c.label}: ${p}`;
  }
  const all = resolveBindings(overrides);
  for (const c of COMMANDS) {
    const clash = clashesWith(all, c.id, all[c.id])[0];
    if (clash) return `${c.label} and ${clash.label} use the same keys`;
  }
  return null;
}

/** Only the entries that differ from the defaults, so a later change to a default still reaches everyone else. */
export function diffFromDefaults(bindings: Record<string, string>): Overrides {
  const out: Overrides = {};
  for (const c of COMMANDS) if (bindings[c.id] !== undefined && bindings[c.id] !== c.default) out[c.id] = bindings[c.id];
  return out;
}
