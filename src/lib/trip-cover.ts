import "server-only";

export type StockCover = { url: string; creditName: string; creditUrl: string };

const API = "https://api.unsplash.com";
const UTM = "utm_source=spend_analyser&utm_medium=referral";

type UnsplashPhoto = {
  urls?: { regular?: string };
  user?: { name?: string; links?: { html?: string } };
  links?: { download_location?: string };
};

/** True when a stock photo source is configured (UNSPLASH_ACCESS_KEY). */
export function stockCoverConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

/**
 * Finds a landscape stock photo for a place. Unsplash terms: hotlink the returned URL (we never copy
 * the file), credit the photographer, and ping download_location when a photo is picked.
 * Returns null when no key is set, nothing matched, or the request failed. Never throws, never logs
 * the key or headers.
 */
export async function findStockCover(query: string, opts: { pick?: "first" | "random" } = {}): Promise<StockCover | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const q = query.trim();
  if (!key || !q) return null;
  const headers = { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };
  try {
    const res = await fetch(`${API}/search/photos?${new URLSearchParams({ query: q, orientation: "landscape", per_page: "10", content_filter: "high" })}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`unsplash search failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { results?: UnsplashPhoto[] };
    const usable = (body.results ?? []).filter((p) => p.urls?.regular && p.user?.name && p.user.links?.html);
    if (!usable.length) return null;
    const photo = opts.pick === "random" ? usable[Math.floor(Math.random() * usable.length)] : usable[0];
    const ping = photo.links?.download_location;
    if (ping) void fetch(ping, { headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
    return {
      url: photo.urls!.regular!,
      creditName: photo.user!.name!,
      creditUrl: `${photo.user!.links!.html}?${UTM}`,
    };
  } catch (e) {
    console.warn(`unsplash search error: ${(e as Error).name}`);
    return null;
  }
}
