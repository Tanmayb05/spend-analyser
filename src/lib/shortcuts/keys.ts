/**
 * Keyboard shortcut strings: parsing, matching key events, and showing them the way each OS writes them.
 * Pure (no DOM globals), so the server, the settings page and tests share it.
 *
 * A binding is one or more chords separated by spaces: "$mod+k", "g t", "?".
 * A chord is modifiers then one key, joined by "+", in a fixed order: $mod, ctrl, alt, shift, meta.
 * "$mod" is ⌘ on Apple devices and Ctrl everywhere else, so one binding works on both.
 */

export type Platform = "mac" | "other";

const MOD_ORDER = ["$mod", "ctrl", "alt", "shift", "meta"] as const;
type Mod = (typeof MOD_ORDER)[number];

/** Key names stored in bindings for keys whose `event.key` is a word or a space. */
const NAMED: Record<string, string> = {
  " ": "space",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  arrowleft: "arrowleft",
  arrowright: "arrowright",
  escape: "escape",
  enter: "enter",
  tab: "tab",
  backspace: "backspace",
  delete: "delete",
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",
};

const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta", "os", "capslock", "altgraph", "fn", "fnlock", "hyper", "super", "symbol", "symbollock"]);

/** Apple platforms read ⌘ as the main modifier. Takes any platform hints (client hint, navigator.platform, user agent). */
export function platformFrom(...hints: (string | null | undefined)[]): Platform {
  return hints.some((h) => h && /mac|iphone|ipad|ipod/i.test(h)) ? "mac" : "other";
}

/** Browser detection: the newer client hint first (Chromium only), then the older fields Safari and Firefox still fill. */
export function detectPlatform(nav: { userAgentData?: { platform?: string }; platform?: string; userAgent?: string }): Platform {
  const hint = nav.userAgentData?.platform;
  if (hint) return platformFrom(hint);
  return platformFrom(nav.platform, nav.userAgent);
}

/** "$mod+Shift+K" → "$mod+shift+k" in the fixed modifier order. Returns null for anything that isn't one valid chord. */
export function normalizeChord(chord: string): string | null {
  const parts = chord.trim().toLowerCase().split("+");
  // "+" itself as the key: "shift++" splits into ["shift", "", ""]
  let key = parts.pop() ?? "";
  if (key === "" && parts.length && parts[parts.length - 1] === "") {
    parts.pop();
    key = "+";
  }
  if (!key) return null;
  const mods = new Set<Mod>();
  for (const p of parts) {
    if (!(MOD_ORDER as readonly string[]).includes(p)) return null;
    mods.add(p as Mod);
  }
  if (key.length > 1 && !Object.values(NAMED).includes(key) && !/^f\d{1,2}$/.test(key)) return null;
  // symbols match with or without Shift (see chordFromEvent), so Shift isn't stored for them
  if (key.length === 1 && !/[a-z0-9]/.test(key)) mods.delete("shift");
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** Normalised binding, or null when invalid. "" stays "" (no shortcut). At most two chords. */
export function normalizeBinding(binding: string): string | null {
  const t = binding.trim();
  if (!t) return "";
  const chords = t.split(/\s+/).map(normalizeChord);
  if (chords.length > 2 || chords.some((c) => c === null)) return null;
  return chords.join(" ");
}

export function chordsOf(binding: string): string[] {
  return binding ? binding.split(" ") : [];
}

function splitChord(chord: string): { mods: Mod[]; key: string } {
  if (chord === "+") return { mods: [], key: "+" };
  if (chord.endsWith("++")) return { mods: chord.slice(0, -2).split("+").filter(Boolean) as Mod[], key: "+" };
  const parts = chord.split("+");
  const key = parts.pop()!;
  return { mods: parts as Mod[], key };
}

/** True when a chord is a plain character key (no Ctrl/⌘/Alt). These are the ones that switch off with "Character keys". */
export function isCharacterChord(chord: string): boolean {
  const { mods } = splitChord(chord);
  return !mods.some((m) => m === "$mod" || m === "ctrl" || m === "alt" || m === "meta");
}

/** A binding counts as character-key when its first chord is (sequences like "g t" start with a bare letter). */
export function isCharacterBinding(binding: string): boolean {
  const [first] = chordsOf(binding);
  return first ? isCharacterChord(first) : false;
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * The chord a key event stands for, in binding form, or null for a lone modifier press.
 * - Letters and digits use the physical key when Alt is held (Mac Alt+K types "˚") or the layout isn't Latin.
 * - Shift is kept for letters and named keys but dropped for symbols, so "?" matches whether the layout needs Shift for it or not.
 */
export function chordFromEvent(e: KeyEventLike, platform: Platform): string | null {
  const raw = e.key ?? "";
  if (!raw || MODIFIER_KEYS.has(raw.toLowerCase()) || raw === "Dead" || raw === "Unidentified" || raw === "Process") return null;

  let key = raw.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(e.code ?? "")?.[1]?.toLowerCase() ?? /^Digit(\d)$/.exec(e.code ?? "")?.[1];
  if (physical && (e.altKey || (key.length === 1 && !/^[\x20-\x7e]$/.test(key)))) key = physical;
  if (key in NAMED) key = NAMED[key];
  else if (key.length > 1 && !/^f\d{1,2}$/.test(key)) return null;

  const mods = new Set<Mod>();
  const mainMod = platform === "mac" ? e.metaKey : e.ctrlKey;
  if (mainMod) mods.add("$mod");
  if (platform === "mac" ? e.ctrlKey : e.metaKey) mods.add(platform === "mac" ? "ctrl" : "meta");
  if (e.altKey) mods.add("alt");
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (e.shiftKey && !symbol) mods.add("shift");
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

const MAC_MOD: Record<Mod, string> = { $mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const OTHER_MOD: Record<Mod, string> = { $mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
const KEY_LABEL: Record<string, string> = {
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  home: "Home",
  end: "End",
  pageup: "Page Up",
  pagedown: "Page Down",
};
const MAC_KEY_LABEL: Record<string, string> = { backspace: "⌫", delete: "⌦", enter: "↩", escape: "esc" };

/** The keys of one chord as each should appear on a key cap: Mac ["⌘", "K"], Windows ["Ctrl", "K"]. */
export function chordKeys(chord: string, platform: Platform): string[] {
  const { mods, key } = splitChord(chord);
  // Mac writes modifiers in the order ⌃ ⌥ ⇧ ⌘
  const order: Mod[] = platform === "mac" ? ["ctrl", "alt", "shift", "$mod", "meta"] : [...MOD_ORDER];
  const names = platform === "mac" ? MAC_MOD : OTHER_MOD;
  const label = (platform === "mac" && MAC_KEY_LABEL[key]) || KEY_LABEL[key] || (/^f\d{1,2}$/.test(key) ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key);
  return [...order.filter((m) => mods.includes(m)).map((m) => names[m]), label];
}

/** One line of text for a binding: Mac "⌘K", "G then T"; Windows "Ctrl+K". Used in titles and the palette. */
export function formatBinding(binding: string, platform: Platform): string {
  return chordsOf(binding)
    .map((c) => chordKeys(c, platform).join(platform === "mac" ? "" : "+"))
    .join(" then ");
}

/** aria-keyshortcuts value ("Meta+K", "Control+K"). The attribute has no syntax for sequences, so those return undefined. */
export function ariaKeyShortcut(binding: string, platform: Platform): string | undefined {
  const chords = chordsOf(binding);
  if (chords.length !== 1) return undefined;
  const { mods, key } = splitChord(chords[0]);
  const aria: Record<Mod, string> = { $mod: platform === "mac" ? "Meta" : "Control", ctrl: "Control", alt: "Alt", shift: "Shift", meta: "Meta" };
  const k = KEY_LABEL[key] && key !== "space" ? key[0].toUpperCase() + key.slice(1) : key === "space" ? "Space" : key.toUpperCase();
  return [...mods.map((m) => aria[m]), k].join("+");
}

/**
 * Chords the browser or OS keeps for itself, or that the app uses without a setting (arrows, digits for tabs, Esc).
 * A web page either can't catch these or shouldn't take them.
 */
const RESERVED: Record<string, string> = {
  escape: "Esc closes things",
  tab: "Tab moves focus",
  "shift+tab": "Shift+Tab moves focus",
  enter: "Enter opens the focused item",
  space: "Space presses the focused button",
  arrowup: "arrows move through lists",
  arrowdown: "arrows move through lists",
  arrowleft: "arrows move inside controls",
  arrowright: "arrows move inside controls",
  home: "Home jumps to the first row",
  end: "End jumps to the last row",
  "$mod+t": "the browser opens a tab",
  "$mod+w": "the browser closes the tab",
  "$mod+n": "the browser opens a window",
  "$mod+shift+t": "the browser reopens a tab",
  "$mod+shift+n": "the browser opens a private window",
  "$mod+shift+w": "the browser closes the window",
  "$mod+l": "the browser focuses the address bar",
  "$mod+r": "the browser reloads",
  "$mod+shift+r": "the browser reloads",
  "$mod+q": "the browser quits",
  "$mod+h": "the system hides the window",
  "$mod+m": "the system minimises the window",
  "$mod+tab": "the system switches apps",
  "ctrl+tab": "the browser switches tabs",
  "$mod+f": "the browser finds in page",
  "$mod+p": "the browser prints",
  "$mod+s": "the browser saves the page",
  "$mod+d": "the browser bookmarks the page",
  "$mod+c": "copy",
  "$mod+v": "paste",
  "$mod+x": "cut",
  "$mod+z": "undo",
  "$mod+shift+z": "redo",
  "$mod+y": "redo",
  "alt+arrowleft": "the browser goes back",
  "alt+arrowright": "the browser goes forward",
  "$mod+arrowleft": "the browser goes back",
  "$mod+arrowright": "the browser goes forward",
  f5: "the browser reloads",
  f11: "the browser goes full screen",
  f12: "the browser opens developer tools",
};
for (let d = 1; d <= 9; d++) {
  RESERVED[String(d)] = `${d} switches to tab ${d}`;
  RESERVED[`$mod+${d}`] = "the browser switches tabs";
}

/** Why a chord can't be used, or null when it's free to use. */
export function reservedReason(chord: string): string | null {
  return RESERVED[chord] ?? null;
}

/** The first problem with a binding on its own (not counting other shortcuts), or null. */
export function bindingProblem(binding: string): string | null {
  const n = normalizeBinding(binding);
  if (n === null) return "That key combination isn't supported";
  if (!n) return null;
  const chords = chordsOf(n);
  // a sequence's later keys are pressed after the first, so only the first chord can collide with the browser
  const r = reservedReason(chords[0]);
  if (r) return `Taken: ${r}`;
  if (chords.length === 2 && !isCharacterChord(chords[0])) return "Two-key sequences must start with a plain key";
  if (chords.length === 2 && chords[1] === "escape") return "Esc can't end a sequence";
  return null;
}

/** Two bindings clash when they are equal or one is the first step of the other ("g" vs "g t"). */
export function bindingsClash(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}
