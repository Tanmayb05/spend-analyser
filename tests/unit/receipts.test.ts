import { describe, expect, it } from "vitest";
import { driveFileId, sniffMime } from "@/lib/receipts/fetch";

describe("drive links", () => {
  it("extracts ids from share links", () => {
    expect(driveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing")).toBe("1AbCdEfGhIjKlMnOp");
    expect(driveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe("1AbCdEfGhIjKlMnOp");
    expect(driveFileId("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit")).toBe("1AbCdEfGhIjKlMnOp");
  });
  it("rejects non-Drive hosts and bad schemes", () => {
    expect(driveFileId("https://evil.com/file/d/1AbCdEfGhIjKlMnOp/view")).toBeNull();
    expect(driveFileId("http://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")).toBeNull();
    expect(driveFileId("https://drive.google.com.evil.com/file/d/1AbCdEfGhIjKlMnOp")).toBeNull();
    expect(driveFileId("not a url")).toBeNull();
  });
  it("sniffs file types by magic bytes", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

import { allocate } from "@/lib/receipts/allocate";

describe("receipt split allocation", () => {
  it("shares tax pro-rata and sums exactly to the total", () => {
    const out = allocate(
      [
        { key: "groceries", total_price: 30 },
        { key: "household", total_price: 10 },
        { key: "groceries", total_price: 20 },
      ],
      53.33,
    );
    expect(out.map((o) => o.key)).toEqual(["groceries", "household"]);
    expect(out[0].amount).toBeCloseTo(44.44, 2);
    expect(out.reduce((a, o) => a + o.amount, 0)).toBeCloseTo(53.33, 2);
  });
  it("handles empty input", () => {
    expect(allocate([], 10)).toEqual([]);
  });
});
