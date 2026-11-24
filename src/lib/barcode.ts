/**
 * Decorative barcode: bar and gap widths (1 to 3 units) derived from a seed, so the same receipt always draws the same strip.
 * It encodes nothing; it is only there to make the paper read as a receipt.
 */
export function barcodeBars(seed: string, count = 36): { x: number; w: number }[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h;
  };
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const w = (next() % 3) + 1;
    const gap = (next() % 3) + 1;
    bars.push({ x, w });
    x += w + gap;
  }
  return bars;
}
