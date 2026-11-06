import { describe, expect, it } from "vitest";
import { transactionSchema } from "@/lib/validation/transaction";

const input = {
  date: "2026-11-06",
  type: "expense" as const,
  category_id: "00000000-0000-4000-8000-000000000001",
  amount: "25",
  currency: "USD",
};

describe("transaction link validation", () => {
  it("accepts http and https links", () => {
    expect(transactionSchema.parse({ ...input, external_url: "https://example.com/order/123" }).external_url).toBe("https://example.com/order/123");
    expect(transactionSchema.parse({ ...input, external_url: "http://localhost:3000/receipt" }).external_url).toBe("http://localhost:3000/receipt");
  });

  it("turns an empty link into null", () => {
    expect(transactionSchema.parse({ ...input, external_url: "  " }).external_url).toBeNull();
  });

  it("rejects unsafe and incomplete links", () => {
    expect(transactionSchema.safeParse({ ...input, external_url: "javascript:alert(1)" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...input, external_url: "example.com/order/123" }).success).toBe(false);
  });
});
