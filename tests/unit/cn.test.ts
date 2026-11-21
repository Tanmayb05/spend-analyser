import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn with project tokens", () => {
  it("lets a later padding token or step override an earlier one", () => {
    expect(cn("p-card", "p-0")).toBe("p-0");
    expect(cn("p-card", "p-2")).toBe("p-2");
    expect(cn("p-0", "p-card-lg")).toBe("p-card-lg");
  });
  it("lets a later radius override an earlier one", () => {
    expect(cn("rounded-card", "rounded-control")).toBe("rounded-control");
    expect(cn("rounded-control", "rounded-none")).toBe("rounded-none");
  });
  it("keeps text-label and a text colour together, and resolves a size override", () => {
    expect(cn("text-label text-muted")).toBe("text-label text-muted");
    expect(cn("text-label", "text-sm")).toBe("text-sm");
  });
  it("keeps unrelated tokens", () => {
    expect(cn("rounded-card", "p-card", "shadow-pop")).toBe("rounded-card p-card shadow-pop");
  });
});
