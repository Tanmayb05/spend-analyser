import "server-only";
import { createHash } from "node:crypto";

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Receipt-level hash. One page: the page hash itself (so single-file receipts keep their existing hash).
 * Several pages: a hash over the ordered page hashes, so re-uploading the same set is caught.
 */
export function receiptHash(pageHashes: string[]): string {
  if (pageHashes.length === 1) return pageHashes[0];
  return createHash("sha256").update(pageHashes.join("\n")).digest("hex");
}
