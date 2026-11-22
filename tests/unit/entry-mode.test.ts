import { describe, expect, it } from "vitest";
import { parseEntryMethod, resolveEntryMode } from "@/lib/entry-mode";

const base = { defaultMethod: "ai" as const, aiReady: true };

describe("resolveEntryMode", () => {
  it("opens AI when it is the default and ready", () => {
    expect(resolveEntryMode(base)).toBe("ai");
    expect(resolveEntryMode({ ...base, preset: {} })).toBe("ai");
  });
  it("opens the form when manual is the default", () => {
    expect(resolveEntryMode({ ...base, defaultMethod: "manual" })).toBe("manual");
  });
  it("falls back to the form when AI is not ready", () => {
    expect(resolveEntryMode({ ...base, aiReady: false })).toBe("manual");
    expect(resolveEntryMode({ ...base, aiReady: false, override: "ai" })).toBe("manual");
  });
  it("lets the in-sheet switch override the default", () => {
    expect(resolveEntryMode({ ...base, override: "manual" })).toBe("manual");
    expect(resolveEntryMode({ ...base, defaultMethod: "manual", override: "ai" })).toBe("ai");
  });
  it("always uses the form to edit or when a preset is given", () => {
    expect(resolveEntryMode({ ...base, editId: "x" })).toBe("manual");
    expect(resolveEntryMode({ ...base, preset: { spread: "1" } })).toBe("manual");
    expect(resolveEntryMode({ ...base, preset: { amount: "5" }, override: "ai" })).toBe("manual");
  });
  it("opens the receipt flow for the receipt preset, even when editing is absent and AI is off", () => {
    expect(resolveEntryMode({ ...base, preset: { __receipt: "1" } })).toBe("receipt");
    expect(resolveEntryMode({ ...base, aiReady: false, preset: { __receipt: "1" } })).toBe("receipt");
  });
});

describe("parseEntryMethod", () => {
  it("defaults to ai", () => {
    expect(parseEntryMethod("manual")).toBe("manual");
    expect(parseEntryMethod("ai")).toBe("ai");
    expect(parseEntryMethod("nope")).toBe("ai");
    expect(parseEntryMethod(null)).toBe("ai");
  });
});
