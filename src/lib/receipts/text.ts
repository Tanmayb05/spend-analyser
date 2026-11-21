import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** Text layer of a PDF, one string per page. Empty strings for pages that are only images. Never throws. */
export async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  try {
    // unpdf transfers the buffer to its worker; give it a copy so the caller's bytes stay usable for upload/vision
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+\n/g, "\n").trim());
  } catch {
    return [];
  }
}
