import "server-only";

export const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_HOSTS = [/^drive\.google\.com$/, /^docs\.google\.com$/, /^drive\.usercontent\.google\.com$/, /^[a-z0-9-]+\.googleusercontent\.com$/];

/** Extracts the file id from common Google Drive share links. */
export function driveFileId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;
  const m = url.pathname.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{10,})/) ?? null;
  const id = m?.[1] ?? url.searchParams.get("id");
  return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
}

/** File type from magic bytes; null when not an accepted receipt format. */
export function sniffMime(buf: Uint8Array): string | null {
  const s = (i: number, n: number) => String.fromCharCode(...buf.slice(i, i + n));
  if (s(0, 4) === "%PDF") return "application/pdf";
  if (buf[0] === 0x89 && s(1, 3) === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  if (s(4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(s(8, 4))) return "image/heic";
  return null;
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("File is larger than 10 MB.");
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("File is larger than 10 MB.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Downloads a publicly shared ("anyone with the link") Google Drive file.
 * Only Google hosts are contacted; redirects are followed manually and re-checked (no SSRF).
 */
export async function fetchDriveFile(link: string): Promise<{ bytes: Uint8Array; mime: string; name: string | null }> {
  const id = driveFileId(link);
  if (!id) throw new Error("That doesn't look like a Google Drive file link.");
  let url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  for (let hop = 0; hop < 5; hop++) {
    const host = new URL(url).hostname;
    if (!ALLOWED_HOSTS.some((r) => r.test(host))) throw new Error("Drive redirected somewhere unexpected.");
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.status === 404) throw new Error("File not found. Check the link.");
    if (!res.ok) throw new Error(`Drive returned ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) throw new Error("This file isn't shared publicly. In Drive, set sharing to “Anyone with the link”.");
    const bytes = await readCapped(res);
    const mime = sniffMime(bytes);
    if (!mime) throw new Error("Only PDF, PNG, JPG, WEBP or HEIC receipts are supported.");
    const cd = res.headers.get("content-disposition") ?? "";
    const name = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? null;
    return { bytes, mime, name: name ? decodeURIComponent(name) : null };
  }
  throw new Error("Too many redirects from Drive.");
}
