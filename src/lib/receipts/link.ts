import { round2 } from "@/lib/utils";
import { sameMerchant } from "./match";

export type LinkFacts = {
  receipt: {
    merchant: string | null;
    date: string | null;
    total: number;
    tip: number | null;
    currency: string;
    payment_method_id: string | null;
  };
  txn: {
    merchant: string | null;
    date: string;
    amount: number;
    currency: string;
    payment_method_id: string | null;
  };
  /** more than one transaction will point at this receipt (split charges) */
  split: boolean;
};

export type Leftover = { amount: number; suggested: "tip" | "fee" | null; suggestedAmount: number | null };

export type LinkQuestions = {
  /** receipt and transaction name the merchant differently */
  merchant: boolean;
  /** receipt and transaction are in different currencies */
  currency: boolean;
  /** the transaction is higher than the receipt: ask what the rest is */
  leftover: Leftover | null;
};

/** Which questions the user has to answer before this link can be saved. */
export function linkQuestions(f: LinkFacts): LinkQuestions {
  const merchant = !!f.receipt.merchant && !!f.txn.merchant && !sameMerchant(f.receipt.merchant, f.txn.merchant) && f.receipt.merchant.trim().toLowerCase() !== f.txn.merchant.trim().toLowerCase();
  const currency = f.receipt.currency !== f.txn.currency;
  let leftover: Leftover | null = null;
  if (!f.split && !currency) {
    const extra = round2(f.txn.amount - f.receipt.total);
    if (extra > 0.011) {
      const tip = f.receipt.tip != null && f.receipt.tip > 0 ? f.receipt.tip : null;
      leftover = { amount: extra, suggested: tip != null ? "tip" : null, suggestedAmount: tip != null && Math.abs(tip - extra) <= 0.011 ? tip : tip != null ? extra : null };
    }
  }
  return { merchant, currency, leftover };
}

export type LinkChoices = {
  merchant: "receipt" | "txn" | "alias";
  /** which currency wins when they differ; "receipt" also takes the receipt's amount */
  currency: "receipt" | "txn";
  /** split mode only: also take the receipt's date */
  takeDate: boolean;
};

export type TxnPatch = {
  date?: string;
  amount?: number;
  currency?: string;
  merchant_name?: string;
  payment_method_id?: string;
};

export type LinkPlan = { patch: TxnPatch; alias: string | null };

/**
 * What the link changes on the transaction, following the spec's conflict table:
 * date: receipt wins; amount: receipt total wins (single link only); merchant, currency: the user's choice;
 * card: detected card wins; notes are never touched.
 */
export function planLink(f: LinkFacts, c: LinkChoices): LinkPlan {
  const patch: TxnPatch = {};
  let alias: string | null = null;

  if (f.receipt.date && (!f.split || c.takeDate) && f.receipt.date !== f.txn.date) patch.date = f.receipt.date;

  const currencyDiffers = f.receipt.currency !== f.txn.currency;
  if (currencyDiffers && c.currency === "receipt") {
    patch.currency = f.receipt.currency;
    if (!f.split) patch.amount = f.receipt.total;
  } else if (!currencyDiffers && !f.split && round2(f.txn.amount) !== round2(f.receipt.total)) {
    patch.amount = f.receipt.total;
  }

  if (f.receipt.merchant && f.txn.merchant && f.receipt.merchant.trim().toLowerCase() !== f.txn.merchant.trim().toLowerCase()) {
    if (c.merchant === "receipt") patch.merchant_name = f.receipt.merchant;
    else if (c.merchant === "alias") alias = f.receipt.merchant;
  } else if (f.receipt.merchant && !f.txn.merchant) {
    patch.merchant_name = f.receipt.merchant;
  }

  if (f.receipt.payment_method_id && f.receipt.payment_method_id !== f.txn.payment_method_id) patch.payment_method_id = f.receipt.payment_method_id;
  return { patch, alias };
}
