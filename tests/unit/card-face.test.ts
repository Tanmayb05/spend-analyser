import { describe, expect, it } from "vitest";
import { maskedNumber } from "@/components/cards/card-face";

describe("maskedNumber", () => {
  it("shows only the last 4 digits", () => {
    expect(maskedNumber("1234")).toBe("XXXX-XXXX-XXXX-1234");
  });
  it("masks everything when no number is saved", () => {
    expect(maskedNumber(null)).toBe("XXXX-XXXX-XXXX-XXXX");
  });
});
