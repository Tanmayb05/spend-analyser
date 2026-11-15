/** Most paychecks a single "Bi-weekly" entry can create (two years' worth). */
export const MAX_BIWEEKLY = 52;
export const DEFAULT_BIWEEKLY = 26;

/**
 * ISO dates for `count` bi-weekly paychecks, the first on `startISO`, then every 14 days.
 * Calendar math runs in UTC so daylight-saving shifts can never move a date.
 */
export function biweeklyDates(startISO: string, count: number): string[] {
  const [y, m, d] = startISO.slice(0, 10).split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) =>
    new Date(start + i * 14 * 86_400_000).toISOString().slice(0, 10),
  );
}
