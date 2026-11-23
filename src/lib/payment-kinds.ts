import { Banknote, Building2, CreditCard, Gift, Smartphone, Wallet, type LucideIcon } from "lucide-react";

/** Payment method types. The type decides which details a method has: only cards carry issuer, network and last 4. */
export const KINDS = ["credit_card", "debit_card", "bank_account", "wallet", "cash", "prepaid", "other"] as const;
export type PaymentKind = (typeof KINDS)[number];

export type KindFields = {
  nickname: boolean;
  issuer: boolean;
  issuerLabel: string;
  network: boolean;
  last4s: boolean;
  /** limit, statement and due days, tracking start, opening balance, minimum due */
  creditTerms: boolean;
};

export type KindMeta = { value: PaymentKind; label: string; plural: string; hint: string; icon: LucideIcon; fields: KindFields };

const none: KindFields = { nickname: false, issuer: false, issuerLabel: "Issuer", network: false, last4s: false, creditTerms: false };

export const KIND_META: Record<PaymentKind, KindMeta> = {
  credit_card: {
    value: "credit_card",
    label: "Credit card",
    plural: "Credit cards",
    hint: "Tracks balance, bill and due date",
    icon: CreditCard,
    fields: { nickname: true, issuer: true, issuerLabel: "Issuer", network: true, last4s: true, creditTerms: true },
  },
  debit_card: {
    value: "debit_card",
    label: "Debit card",
    plural: "Debit cards",
    hint: "Spends straight from a bank account",
    icon: CreditCard,
    fields: { nickname: true, issuer: true, issuerLabel: "Bank", network: true, last4s: true, creditTerms: false },
  },
  bank_account: {
    value: "bank_account",
    label: "Bank account",
    plural: "Bank accounts",
    hint: "Transfers, ACH, UPI to a bank",
    icon: Building2,
    fields: { ...none, issuer: true, issuerLabel: "Bank" },
  },
  wallet: {
    value: "wallet",
    label: "Digital wallet",
    plural: "Digital wallets",
    hint: "Apple Pay, PayPal, Venmo, Paytm",
    icon: Smartphone,
    fields: none,
  },
  cash: {
    value: "cash",
    label: "Cash",
    plural: "Cash",
    hint: "Notes and coins",
    icon: Banknote,
    fields: none,
  },
  prepaid: {
    value: "prepaid",
    label: "Prepaid or gift card",
    plural: "Prepaid and gift cards",
    hint: "Loaded or gifted balance",
    icon: Gift,
    fields: { ...none, last4s: true },
  },
  other: {
    value: "other",
    label: "Other",
    plural: "Other",
    hint: "Cheque, buy now pay later, anything else",
    icon: Wallet,
    fields: none,
  },
};

export const KIND_LIST: KindMeta[] = KINDS.map((k) => KIND_META[k]);

export const isKind = (v: unknown): v is PaymentKind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

/** Falls back to Other for anything unknown (old rows, new values from a newer deploy). */
export const kindMeta = (v: string | null | undefined): KindMeta => (isKind(v) ? KIND_META[v] : KIND_META.other);

export const isCardKind = (k: PaymentKind) => k === "credit_card" || k === "debit_card" || k === "prepaid";

/** Best guess at a type from what the user typed ("Venmo" -> wallet). Returns null when nothing fits. */
export function inferKind(name: string): PaymentKind | null {
  const n = name.toLowerCase();
  if (!n.trim()) return null;
  if (/\b(debit)\b/.test(n)) return "debit_card";
  if (/\b(credit|visa|mastercard|amex|sapphire|freedom|discover|platinum|gold card)\b/.test(n)) return "credit_card";
  if (/\b(gift|prepaid|store credit)\b/.test(n)) return "prepaid";
  if (/\b(cash|petty)\b/.test(n)) return "cash";
  if (/\b(upi|wallet|apple pay|google pay|gpay|paypal|venmo|cash app|zelle|paytm|phonepe|alipay|samsung pay)\b/.test(n)) return "wallet";
  if (/\b(bank|transfer|ach|wire|checking|savings|neft|imps|rtgs)\b/.test(n)) return "bank_account";
  return null;
}

/** Which kinds each detail applies to, so saves can clear what a type does not use. */
export const usesLast4s = (k: PaymentKind) => KIND_META[k].fields.last4s;
