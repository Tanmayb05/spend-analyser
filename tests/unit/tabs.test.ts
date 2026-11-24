import { describe, expect, it } from "vitest";
import { parseTxnTab } from "@/components/transactions/tab-intro";
import { parseInsightTab } from "@/components/insights/tabs";

describe("parseTxnTab", () => {
  it("defaults to activity", () => {
    expect(parseTxnTab(undefined)).toBe("activity");
    expect(parseTxnTab("nonsense")).toBe("activity");
    expect(parseTxnTab(["plans"])).toBe("activity");
  });
  it("keeps plans and cards", () => {
    expect(parseTxnTab("plans")).toBe("plans");
    expect(parseTxnTab("cards")).toBe("cards");
  });
  it("sends the retired emis tab to plans", () => {
    expect(parseTxnTab("emis")).toBe("plans");
  });
});

describe("parseInsightTab", () => {
  it("defaults to overview", () => {
    expect(parseInsightTab(undefined)).toBe("overview");
    expect(parseInsightTab("x")).toBe("overview");
  });
  it("accepts the other tabs", () => {
    for (const t of ["categories", "habits", "ai"] as const) expect(parseInsightTab(t)).toBe(t);
  });
});
