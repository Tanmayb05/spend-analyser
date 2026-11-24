import { describe, expect, it } from "vitest";
import { tintKey } from "@/lib/tint";
import { tripPartColors } from "@/components/charts/colors";

describe("tintKey", () => {
  it("uses the subcategory, else the category, like the trip breakdown keys", () => {
    expect(tintKey({ subcategory_id: "sub1", category_id: "c1" })).toBe("sub1");
    expect(tintKey({ subcategory_id: null as unknown as string, category_id: "c1" })).toBe("cat:c1");
  });
  it("entries sharing a label share a colour", () => {
    const colors = tripPartColors(["Flights", "Food", "Food"]);
    expect(colors.get("Food")).toBeDefined();
    expect(tripPartColors(["Food"]).get("Food")).toBe(colors.get("Food"));
  });
});
