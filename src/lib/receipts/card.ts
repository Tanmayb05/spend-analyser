/** Card details printed on receipts and shown on cards. Pure helpers, safe on server and client. */

export const NETWORKS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "Amex" },
  { value: "discover", label: "Discover" },
  { value: "other", label: "Other" },
] as const;
export type Network = (typeof NETWORKS)[number]["value"];

/** Common US issuers offered in the picker. Free text is allowed too; nothing here is seeded into accounts. */
export const ISSUERS = [
  "Chase",
  "Capital One",
  "Citi",
  "Bank of America",
  "Wells Fargo",
  "American Express",
  "Discover",
  "Barclays",
  "US Bank",
  "Apple Card",
] as const;

export const CARD_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

const BRANDS: [RegExp, string, Network][] = [
  [/\bvisa\b/i, "Visa", "visa"],
  [/\bmaster\s?card\b|\bmc\b/i, "Mastercard", "mastercard"],
  [/\bamex\b|\bamerican express\b/i, "Amex", "amex"],
  [/\bdiscover\b/i, "Discover", "discover"],
  [/\bdebit\b/i, "Debit", "other"],
];

/** Network for a brand string as printed on a receipt ("Visa", "MASTERCARD", "Debit"). */
export function networkOf(brand: string | null | undefined): Network | null {
  if (!brand) return null;
  return BRANDS.find(([re]) => re.test(brand))?.[2] ?? null;
}

// Each pattern captures the last 4 digits. They all need a card word, "ending", or X-masking next to the digits,
// so a loyalty or membership number ("#0823") is never read as a card.
const LAST4: RegExp[] = [
  /(?:visa|master\s?card|mc|amex|american express|discover|debit|credit)\b[^\d\n]{0,16}?(\d{4})\b(?![.,]\d)/i,
  /(?:ending(?:\s+in)?|acct|account)\b[^\d\n]{0,12}(\d{4})\b(?![.,]\d)/i,
  /(?:[xX*•]{2,}[\s-]?){1,4}(\d{4})\b/,
];

/** First payment-card last 4 found in receipt text, with the brand when a card word is next to it. */
export function findCardLast4(text: string): { last4: string; brand: string | null } | null {
  for (const re of LAST4) {
    const m = re.exec(text);
    if (!m) continue;
    const around = text.slice(Math.max(0, m.index - 16), m.index + m[0].length + 4);
    const brand = BRANDS.find(([b]) => b.test(around))?.[1] ?? null;
    return { last4: m[1], brand };
  }
  return null;
}

const MEMBER_LINE = /\b(member(?:ship)?|loyalty|rewards?|club|plus card|shopper|fuel points)\b[^\n]{0,40}?#?\s*\d[\d\s-]{3,}/gi;

/** Removes membership and loyalty numbers from receipt text before it is sent or stored. */
export function stripMemberNumbers(text: string): string {
  return text.replace(MEMBER_LINE, (m) => m.replace(/\d[\d\s-]{3,}/g, "[removed]"));
}

/** Two-letter badge for a card: issuer first, then nickname, then name. */
export function monogram(issuer: string | null | undefined, nickname: string | null | undefined, name: string): string {
  const src = (issuer?.trim() || nickname?.trim() || name.trim() || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const words = src.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase() || "?";
}

export const isLast4 = (v: string) => /^\d{4}$/.test(v);
