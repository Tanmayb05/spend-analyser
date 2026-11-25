import { describe, expect, it } from "vitest";
import {
  ariaKeyShortcut,
  bindingProblem,
  bindingsClash,
  chordFromEvent,
  detectPlatform,
  formatBinding,
  isCharacterBinding,
  normalizeBinding,
  platformFrom,
} from "@/lib/shortcuts/keys";
import { COMMANDS, clashesWith, diffFromDefaults, parseOverrides, resolveBindings, validateOverrides } from "@/lib/shortcuts/commands";

const ev = (key: string, mods: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {}, code = "") => ({
  key,
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("platform", () => {
  it("reads Apple devices as mac from any hint", () => {
    expect(platformFrom('"macOS"')).toBe("mac");
    expect(platformFrom(null, "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("mac");
    expect(platformFrom("iPad")).toBe("mac");
    expect(platformFrom('"Windows"', "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("other");
    expect(platformFrom(undefined, "Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
  });

  it("prefers the client hint, then falls back to the older fields", () => {
    expect(detectPlatform({ userAgentData: { platform: "Windows" }, platform: "MacIntel" })).toBe("other");
    expect(detectPlatform({ platform: "MacIntel", userAgent: "" })).toBe("mac");
    expect(detectPlatform({ userAgentData: { platform: "" }, platform: "Win32" })).toBe("other");
  });
});

describe("chordFromEvent", () => {
  it("maps the main modifier per OS to $mod", () => {
    expect(chordFromEvent(ev("k", { meta: true }), "mac")).toBe("$mod+k");
    expect(chordFromEvent(ev("k", { ctrl: true }), "other")).toBe("$mod+k");
    expect(chordFromEvent(ev("k", { ctrl: true }), "mac")).toBe("ctrl+k");
  });

  it("keeps Shift for letters, drops it for symbols", () => {
    expect(chordFromEvent(ev("K", { shift: true }), "other")).toBe("shift+k");
    expect(chordFromEvent(ev("?", { shift: true }), "other")).toBe("?");
    expect(chordFromEvent(ev("?"), "other")).toBe("?");
  });

  it("uses the physical key with Alt on a Mac and on non-Latin layouts", () => {
    expect(chordFromEvent(ev("˚", { alt: true }, "KeyK"), "mac")).toBe("alt+k");
    expect(chordFromEvent(ev("л", {}, "KeyK"), "other")).toBe("k");
  });

  it("names special keys and ignores lone modifiers", () => {
    expect(chordFromEvent(ev("Backspace", { meta: true }), "mac")).toBe("$mod+backspace");
    expect(chordFromEvent(ev(" "), "mac")).toBe("space");
    expect(chordFromEvent(ev("Shift", { shift: true }), "mac")).toBeNull();
    expect(chordFromEvent(ev("Meta", { meta: true }), "mac")).toBeNull();
  });
});

describe("bindings", () => {
  it("normalises modifier order and case", () => {
    expect(normalizeBinding("Shift+$mod+K")).toBe("$mod+shift+k");
    expect(normalizeBinding(" g   T ")).toBe("g t");
    expect(normalizeBinding("shift+?")).toBe("?");
    expect(normalizeBinding("")).toBe("");
    expect(normalizeBinding("hyper+k")).toBeNull();
    expect(normalizeBinding("a b c")).toBeNull();
  });

  it("formats for each OS", () => {
    expect(formatBinding("$mod+k", "mac")).toBe("⌘K");
    expect(formatBinding("$mod+k", "other")).toBe("Ctrl+K");
    expect(formatBinding("$mod+shift+k", "mac")).toBe("⇧⌘K");
    expect(formatBinding("g t", "other")).toBe("G then T");
    expect(formatBinding("$mod+backspace", "mac")).toBe("⌘⌫");
  });

  it("gives aria-keyshortcuts for single chords only", () => {
    expect(ariaKeyShortcut("$mod+k", "mac")).toBe("Meta+K");
    expect(ariaKeyShortcut("$mod+k", "other")).toBe("Control+K");
    expect(ariaKeyShortcut("g t", "mac")).toBeUndefined();
  });

  it("knows which are character-key shortcuts", () => {
    expect(isCharacterBinding("n")).toBe(true);
    expect(isCharacterBinding("g t")).toBe(true);
    expect(isCharacterBinding("shift+n")).toBe(true);
    expect(isCharacterBinding("$mod+k")).toBe(false);
    expect(isCharacterBinding("alt+n")).toBe(false);
  });

  it("refuses browser and built-in keys", () => {
    expect(bindingProblem("$mod+t")).toMatch(/opens a tab/);
    expect(bindingProblem("$mod+w")).toMatch(/closes the tab/);
    expect(bindingProblem("escape")).toMatch(/Esc/);
    expect(bindingProblem("2")).toMatch(/tab 2/);
    expect(bindingProblem("$mod+k g")).toMatch(/plain key/);
    expect(bindingProblem("g escape")).toMatch(/Esc/);
    expect(bindingProblem("g t")).toBeNull();
    expect(bindingProblem("")).toBeNull();
  });

  it("treats a key that starts a sequence as a clash", () => {
    expect(bindingsClash("g", "g t")).toBe(true);
    expect(bindingsClash("g t", "g t")).toBe(true);
    expect(bindingsClash("g t", "g s")).toBe(false);
    expect(bindingsClash("s", "g s")).toBe(false);
    expect(bindingsClash("", "")).toBe(false);
  });
});

describe("commands", () => {
  it("ships defaults that are valid and don't clash", () => {
    const ids = new Set(COMMANDS.map((c) => c.id));
    expect(ids.size).toBe(COMMANDS.length);
    for (const c of COMMANDS) expect(bindingProblem(c.default), c.id).toBeNull();
    expect(validateOverrides({})).toBeNull();
  });

  it("drops unknown ids and invalid bindings from stored overrides", () => {
    expect(parseOverrides({ "txn.new": "A", nope: "b", "help.open": "hyper+x", "palette.open": 3 })).toEqual({ "txn.new": "a" });
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides(["x"])).toEqual({});
  });

  it("applies overrides on top of defaults; '' removes a shortcut", () => {
    const b = resolveBindings({ "txn.new": "a", "help.open": "" });
    expect(b["txn.new"]).toBe("a");
    expect(b["help.open"]).toBe("");
    expect(b["palette.open"]).toBe("$mod+k");
  });

  it("finds clashes and rejects them on save", () => {
    const b = resolveBindings({});
    expect(clashesWith(b, "txn.new", "g").map((c) => c.id)).toContain("go.trips");
    expect(clashesWith(b, "txn.new", "?").map((c) => c.id)).toEqual(["help.open"]);
    expect(validateOverrides({ "txn.new": "?" })).toMatch(/same keys/);
    expect(validateOverrides({ "txn.new": "?", "help.open": "h" })).toBeNull();
    expect(validateOverrides({ "txn.new": "$mod+t" })).toMatch(/opens a tab/);
  });

  it("stores only what differs from the defaults", () => {
    const b = resolveBindings({ "txn.new": "a" });
    expect(diffFromDefaults(b)).toEqual({ "txn.new": "a" });
    expect(diffFromDefaults(resolveBindings({}))).toEqual({});
  });
});
