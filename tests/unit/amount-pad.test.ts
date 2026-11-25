import { describe, expect, it } from "vitest";
import { typeKey } from "@/components/vendor/kokonut/amount-pad";

const type = (keys: string[], start = "") => keys.reduce<string | null>((v, k) => (v === null ? null : typeKey(v, k) ?? v), start);

describe("amount pad typing", () => {
  it("builds a decimal amount", () => expect(type(["1", "2", ".", "5", "0"])).toBe("12.50"));
  it("starts a bare point as 0.", () => expect(typeKey("", ".")).toBe("0."));
  it("refuses a second point and a third decimal", () => {
    expect(typeKey("1.2", ".")).toBeNull();
    expect(typeKey("1.25", "9")).toBeNull();
  });
  it("caps whole digits at 7", () => {
    expect(typeKey("1234567", "8")).toBeNull();
    expect(typeKey("1234567", ".")).toBe("1234567.");
  });
  it("replaces a lone leading zero", () => expect(typeKey("0", "7")).toBe("7"));
  it("deletes the last character, and does nothing when empty", () => {
    expect(typeKey("12.5", "back")).toBe("12.");
    expect(typeKey("", "back")).toBe("");
  });
  it("edits an existing amount from the database", () => expect(typeKey("42.5", "0")).toBe("42.50"));
});
