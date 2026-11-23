"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { AiError, generateJsonWithFallback } from "@/lib/ai/generate";
import { receiptSchema, toExtraction, type ReceiptExtraction } from "@/lib/ai/schemas";
import { receiptSystem } from "@/lib/ai/prompts";
import { categoryList, context, matchCategory } from "@/lib/ai/context";
import { fetchDriveFile, MAX_BYTES, sniffMime } from "@/lib/receipts/fetch";
import { receiptHash, sha256Hex } from "@/lib/receipts/hash";
import { checkPageCaps } from "@/lib/receipts/pages";
import { pdfPageTexts } from "@/lib/receipts/text";
import { checkTotals, hasTextLayer } from "@/lib/receipts/validate";
import { findCardLast4, networkOf, stripMemberNumbers } from "@/lib/receipts/card";
import { extractionFromReview, labelFromFileName, normalizeExtraction, scrubExtraction, totalPaidOf } from "@/lib/receipts/extract";
import { broaderSuggestions, matchedSoFar, rankCandidates, type Candidate, type ReceiptTarget } from "@/lib/receipts/match";
import { linkQuestions, planLink } from "@/lib/receipts/link";
import { dayOffset, loadCandidatePool } from "@/lib/receipts/pool";
import { loadInbox } from "@/lib/receipts/inbox";
import { getRate } from "@/lib/fx";
import { round2 } from "@/lib/utils";

/** `fatal`: retrying other receipts in the same batch is pointless (limit reached, AI off or not set up). */
type Fail = { ok: false; error: string; fatal?: boolean };
const failOf = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic" };
const BUCKET = "receipts";

// ---------------------------------------------------------------------------
// Drive link -> one uploaded page (kept from the old flow; not extended)
// ---------------------------------------------------------------------------
export type PageRef = { storagePath: string; fileName: string };

export async function fetchDriveAction(url: string): Promise<{ ok: true; page: PageRef } | Fail> {
  try {
    const { supabase, userId } = await requireUser();
    const f = await fetchDriveFile(url);
    const path = `${userId}/uploads/${randomUUID()}.${EXT[f.mime] ?? "bin"}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f.bytes, { contentType: f.mime });
    if (up.error) return { ok: false, error: `Couldn't store the file: ${up.error.message}` };
    return { ok: true, page: { storagePath: path, fileName: f.name ?? "drive-receipt" } };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Pages -> one receipt -> extraction
// ---------------------------------------------------------------------------
export type ReceiptItemDraft = ReceiptExtraction["items"][number] & { category_id: string; subcategory_id: string };

export type ReceiptDraft = {
  receiptId: string;
  pages: { url: string | null; mime: string; name: string | null }[];
  merchant: string;
  date: string;
  /** the receipt shows no date; `date` is a guess the user must confirm */
  dateMissing: boolean;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  fees: number | null;
  total: number;
  tip: number | null;
  tipSource: "printed" | "handwritten" | "none";
  totalPaid: number | null;
  cardLast4: string | null;
  cardBrand: string | null;
  /** card matched from the last 4; empty when none matched */
  paymentMethodId: string;
  orderType: "in_store" | "delivery" | "pickup" | "online" | null;
  orderNumber: string | null;
  storeAddress: string | null;
  label: string;
  items: ReceiptItemDraft[];
  /** why the numbers might be off (shown above the item list) */
  warnings: string[];
  textSource: "pdf_text" | "vision" | null;
  /** transactions already pointing at this receipt (re-scan of a saved receipt) */
  linkedCount: number;
  /** what those transactions add up to, in the receipt's currency */
  linkedAmount: number;
  cached: boolean;
  remaining: number | null;
};

const PARSE_NOTE = "Receipt text:";

async function download(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, path: string): Promise<Uint8Array> {
  if (!path.startsWith(`${userId}/`) || path.includes("..")) throw new Error("Invalid file.");
  const dl = await supabase.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) throw new Error("Upload not found. Try again.");
  if (dl.data.size > MAX_BYTES) throw new Error("A file is larger than 10 MB.");
  return new Uint8Array(await dl.data.arrayBuffer());
}

export async function parseReceiptAction(input: { pages: PageRef[]; fileDate?: string }): Promise<{ ok: true; draft: ReceiptDraft } | Fail> {
  try {
    const pagesIn = z.array(z.object({ storagePath: z.string().max(300), fileName: z.string().max(300) })).min(1).max(20).safeParse(input.pages);
    if (!pagesIn.success) return { ok: false, error: "Choose at least one file." };
    const ctx = await context();
    const { supabase, userId } = ctx;

    const files: { bytes: Uint8Array; mime: string; name: string; sha: string; tempPath: string }[] = [];
    for (const p of pagesIn.data) {
      const bytes = await download(supabase, userId, p.storagePath);
      const mime = sniffMime(bytes);
      if (!mime) return { ok: false, error: "Only PDF, PNG, JPG, WEBP or HEIC receipts are supported." };
      files.push({ bytes, mime, name: p.fileName, sha: sha256Hex(bytes), tempPath: p.storagePath });
    }
    const capError = checkPageCaps(files.map((f) => ({ size: f.bytes.byteLength })));
    if (capError) return { ok: false, error: capError };
    const hash = receiptHash(files.map((f) => f.sha));

    // store each page under its own hash (idempotent), then drop the temporary upload
    const paths = files.map((f) => `${userId}/${f.sha}.${EXT[f.mime]}`);
    for (const [i, f] of files.entries()) {
      if (f.tempPath !== paths[i]) {
        const up = await supabase.storage.from(BUCKET).upload(paths[i], f.bytes, { contentType: f.mime, upsert: true });
        if (up.error) return { ok: false, error: `Couldn't store the file: ${up.error.message}` };
      }
    }
    const temps = files.map((f) => f.tempPath).filter((t, i) => t !== paths[i]);
    if (temps.length) await supabase.storage.from(BUCKET).remove(temps);

    const signed = await Promise.all(paths.map((p) => supabase.storage.from(BUCKET).createSignedUrl(p, 60 * 60)));
    const pageViews = files.map((f, i) => ({ url: signed[i].data?.signedUrl ?? null, mime: f.mime, name: f.name }));

    // same set of pages already read: reuse it, no AI call
    const existing = await supabase.from("receipts").select("*").eq("sha256", hash).maybeSingle();
    let receiptId = existing.data?.id ?? null;
    let extraction = existing.data?.extracted && existing.data.status !== "pending" && existing.data.status !== "failed" ? normalizeExtraction(existing.data.extracted) : null;
    let remaining: number | null = null;
    let textSource = (existing.data?.text_source as "pdf_text" | "vision" | null) ?? null;
    let warnings: string[] = [];

    if (!receiptId) {
      const ins = await supabase
        .from("receipts")
        .insert({
          storage_path: paths[0],
          file_name: files[0].name,
          mime: files[0].mime,
          sha256: hash,
          status: "pending",
          label: labelFromFileName(files[0].name),
        })
        .select("id")
        .single();
      if (ins.error) return { ok: false, error: ins.error.message };
      receiptId = ins.data.id;
      const pg = await supabase.from("receipt_pages").insert(files.map((f, i) => ({ receipt_id: receiptId!, page_no: i + 1, storage_path: paths[i], mime: f.mime, sha256: f.sha })));
      if (pg.error) return { ok: false, error: pg.error.message };
    }

    if (!extraction) {
      // text first: a PDF with a real text layer goes to the model as text, with the page files as the fallback
      const pdfTexts = files.every((f) => f.mime === "application/pdf") ? (await Promise.all(files.map((f) => pdfPageTexts(f.bytes)))).flat() : [];
      const text = stripMemberNumbers(pdfTexts.join("\n\n--- next page ---\n\n"));
      const useText = pdfTexts.length > 0 && hasTextLayer(text);
      const intro = `Expense categories:\n${categoryList(ctx.cats, ctx.subs, "expense")}\n\nKnown merchants: ${ctx.merchants.map((m) => m.name).join(", ")}`;
      const visionInput = { text: intro, files: files.map((f) => ({ data: f.bytes, mediaType: f.mime })) };
      const res = await generateJsonWithFallback({
        feature: "parse_receipt",
        system: receiptSystem(ctx.base, ctx.today),
        primary: useText ? { text: `${intro}\n\n${PARSE_NOTE}\n"""\n${text}\n"""` } : visionInput,
        fallback: useText ? visionInput : undefined,
        accept: (d) => checkTotals(toExtraction(d)).ok,
        schema: receiptSchema,
      });
      extraction = scrubExtraction(normalizeExtraction(toExtraction(res.data)));
      remaining = res.remaining;
      textSource = useText && res.path === "primary" ? "pdf_text" : "vision";
      // a card number the model missed but the text layer shows
      if (!extraction.card_last4 && useText) {
        const found = findCardLast4(text);
        if (found) extraction = { ...extraction, card_last4: found.last4, card_brand: extraction.card_brand ?? found.brand };
      }
      const check = checkTotals(extraction);
      warnings = check.ok ? [] : check.reasons;

      const card = extraction.card_last4 ? await supabase.from("payment_method_cards").select("payment_method_id").eq("last4", extraction.card_last4).maybeSingle() : null;
      const upd = await supabase
        .from("receipts")
        .update({
          status: "parsed",
          merchant_name: extraction.merchant,
          purchased_at: extraction.date,
          currency: extraction.currency ?? ctx.base,
          subtotal: extraction.subtotal,
          tax: extraction.tax,
          discount: extraction.discount,
          fees: extraction.fees,
          total: extraction.total,
          tip: extraction.tip,
          tip_source: extraction.tip_source,
          total_paid: totalPaidOf(extraction),
          card_last4: extraction.card_last4,
          card_brand: extraction.card_brand,
          payment_method_id: card?.data?.payment_method_id ?? null,
          order_type: extraction.order_type,
          order_number: extraction.order_number,
          store_address: extraction.store_address,
          text_source: textSource,
          extracted: extraction as never,
          error: null,
        })
        .eq("id", receiptId);
      if (upd.error) return { ok: false, error: upd.error.message };
    } else {
      const check = checkTotals(extraction);
      warnings = check.ok ? [] : check.reasons;
    }

    const draft = await assembleDraft(ctx, receiptId, extraction, {
      pages: pageViews,
      label: existing.data?.label ?? labelFromFileName(files[0].name) ?? "",
      fileDate: input.fileDate,
      warnings,
      textSource,
      remaining,
    });
    return { ok: true, draft };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message, fatal: ["quota", "global_limit", "not_configured", "disabled", "auth"].includes(e.code) };
    return failOf(e);
  }
}

type Ctx = Awaited<ReturnType<typeof context>>;

/** The draft the review and link steps work on, built from a (possibly edited) stored extraction plus live link state. */
async function assembleDraft(
  ctx: Ctx,
  receiptId: string,
  e: ReceiptExtraction,
  o: { pages: ReceiptDraft["pages"]; label: string; fileDate?: string; warnings: string[]; textSource: ReceiptDraft["textSource"]; remaining: number | null; paymentMethodId?: string | null },
): Promise<ReceiptDraft> {
  const { supabase } = ctx;
  const itemsSum = e.items.reduce((a, i) => a + i.total_price, 0);
  const cardRow = e.card_last4 ? await supabase.from("payment_method_cards").select("payment_method_id").eq("last4", e.card_last4).maybeSingle() : null;
  const linked = await supabase.from("transactions").select("amount, currency").eq("receipt_id", receiptId);
  const currency = e.currency ?? ctx.base;
  const total = e.total ?? round2(itemsSum);
  return {
    receiptId,
    pages: o.pages,
    merchant: e.merchant ?? "",
    date: e.date ?? o.fileDate ?? ctx.today,
    dateMissing: !e.date,
    currency,
    subtotal: e.subtotal,
    tax: e.tax,
    discount: e.discount,
    fees: e.fees,
    total,
    tip: e.tip,
    tipSource: e.tip_source,
    totalPaid: totalPaidOf({ ...e, total }),
    cardLast4: e.card_last4,
    cardBrand: e.card_brand,
    paymentMethodId: o.paymentMethodId ?? cardRow?.data?.payment_method_id ?? "",
    orderType: e.order_type,
    orderNumber: e.order_number,
    storeAddress: e.store_address,
    label: o.label,
    items: e.items.map((i) => ({ ...i, ...matchCategory(ctx.cats, ctx.subs, i.category, i.subcategory) })),
    warnings: o.warnings,
    textSource: o.textSource,
    linkedCount: linked.data?.length ?? 0,
    linkedAmount: round2((linked.data ?? []).filter((t) => t.currency.trim() === currency).reduce((a, t) => a + Number(t.amount), 0)),
    cached: o.remaining === null,
    remaining: o.remaining,
  };
}

/** Reopen a saved receipt (from the inbox) without reading it again. */
export async function loadReceiptDraftAction(receiptId: string): Promise<{ ok: true; draft: ReceiptDraft } | Fail> {
  if (!z.string().uuid().safeParse(receiptId).success) return { ok: false, error: "Invalid receipt." };
  try {
    const ctx = await context();
    const { supabase } = ctx;
    const row = await supabase.from("receipts").select("*").eq("id", receiptId).maybeSingle();
    if (!row.data) return { ok: false, error: "That receipt no longer exists." };
    if (!row.data.extracted) return { ok: false, error: "This receipt was never read. Scan it again." };
    const pageRows = await supabase.from("receipt_pages").select("page_no, storage_path, mime, receipt_id").eq("receipt_id", receiptId).order("page_no");
    const stored = pageRows.data?.length ? pageRows.data.map((p) => ({ path: p.storage_path, mime: p.mime })) : row.data.storage_path ? [{ path: row.data.storage_path, mime: row.data.mime ?? "application/octet-stream" }] : [];
    if (!stored.length) return { ok: false, error: "This receipt has no file." };
    const signed = await Promise.all(stored.map((p) => supabase.storage.from(BUCKET).createSignedUrl(p.path, 60 * 60)));
    const pages = stored.map((p, i) => ({ url: signed[i].data?.signedUrl ?? null, mime: p.mime ?? "application/octet-stream", name: null as string | null }));
    const e = normalizeExtraction(row.data.extracted);
    const check = checkTotals(e);
    const draft = await assembleDraft(ctx, receiptId, e, {
      pages,
      label: row.data.label ?? "",
      warnings: check.ok ? [] : check.reasons,
      textSource: (row.data.text_source as ReceiptDraft["textSource"]) ?? null,
      remaining: null,
      paymentMethodId: row.data.payment_method_id ?? undefined,
    });
    return { ok: true, draft };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
export type CandidateView = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  merchant: string | null;
  paymentName: string | null;
  score: number;
  reasons: string[];
};

const findSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  total: z.number().positive(),
  totalPaid: z.number().positive().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  merchant: z.string().max(120).nullable(),
  paymentMethodId: z.string().uuid().or(z.literal("")).nullable(),
  orderType: z.enum(["in_store", "delivery", "pickup", "online"]).nullable(),
  exclude: z.array(z.string().uuid()).max(50).optional(),
});

const toView = (c: Candidate, pm: Map<string, string>): CandidateView => ({
  id: c.txn.id,
  date: c.txn.date,
  amount: c.txn.amount,
  currency: c.txn.currency,
  merchant: c.txn.merchant,
  paymentName: c.txn.payment_method_id ? (pm.get(c.txn.payment_method_id) ?? null) : null,
  score: c.score,
  reasons: c.reasons,
});

export async function findMatchesAction(input: z.input<typeof findSchema>): Promise<{ ok: true; candidates: CandidateView[]; broader: CandidateView[] } | Fail> {
  const v = findSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid receipt." };
  try {
    const { supabase } = await requireUser();
    const r = v.data;
    const { txns, paymentNames: pmNames } = await loadCandidatePool(supabase, r.date ? { from: dayOffset(r.date, -30), to: dayOffset(r.date, 30) } : {});
    const target: ReceiptTarget = {
      date: r.date,
      total: r.total,
      total_paid: r.totalPaid,
      currency: r.currency,
      merchant: r.merchant,
      payment_method_id: r.paymentMethodId || null,
      order_type: r.orderType,
    };
    const exclude = new Set(r.exclude ?? []);
    const candidates = rankCandidates(target, txns, { exclude });
    const broader = candidates.length ? [] : broaderSuggestions(target, txns, { exclude });
    return { ok: true, candidates: candidates.map((c) => toView(c, pmNames)), broader: broader.map((c) => toView(c, pmNames)) };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Questions the link needs answered (computed on the server from the real rows)
// ---------------------------------------------------------------------------
const questionsSchema = z.object({
  receipt: z.object({
    merchant: z.string().max(120).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    total: z.number().positive(),
    tip: z.number().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    paymentMethodId: z.string().uuid().or(z.literal("")),
  }),
  txnIds: z.array(z.string().uuid()).min(1).max(10),
  /** transactions already linked to this receipt (split mode adds to them) */
  alreadyLinked: z.number().int().min(0).max(10).optional(),
});

export type LinkQuestionsView = {
  txnId: string;
  txn: { merchant: string | null; date: string; amount: number; currency: string; category_id: string; subcategory_id: string };
  merchant: boolean;
  currency: boolean;
  leftover: { amount: number; suggested: "tip" | "fee" | null; suggestedAmount: number | null } | null;
};

export async function linkQuestionsAction(input: z.input<typeof questionsSchema>): Promise<{ ok: true; questions: LinkQuestionsView[]; split: boolean } | Fail> {
  const v = questionsSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid link." };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("transactions").select("id, date, amount, currency, payment_method_id, category_id, subcategory_id, merchant:merchants(name)").in("id", v.data.txnIds);
    if (error) return { ok: false, error: error.message };
    const split = v.data.txnIds.length + (v.data.alreadyLinked ?? 0) > 1;
    const questions = v.data.txnIds.flatMap((id) => {
      const t = (data ?? []).find((x) => x.id === id);
      if (!t) return [];
      const txn = { merchant: (t.merchant as { name: string } | null)?.name ?? null, date: t.date, amount: Number(t.amount), currency: t.currency.trim() };
      const q = linkQuestions({
        receipt: { ...v.data.receipt, payment_method_id: v.data.receipt.paymentMethodId || null },
        txn: { ...txn, payment_method_id: t.payment_method_id },
        split,
      });
      return [{ txnId: id, txn: { ...txn, category_id: t.category_id, subcategory_id: t.subcategory_id ?? "" }, ...q }];
    });
    return { ok: true, questions, split };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Save: card -> receipt + items -> create / link / park
// ---------------------------------------------------------------------------
const uuidOrEmpty = z.string().uuid().or(z.literal(""));
const money = z.number().finite().min(0).max(10_000_000);

const draftSchema = z.object({
  receiptId: z.string().uuid(),
  merchant: z.string().trim().max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subtotal: money.nullable(),
  tax: money.nullable(),
  discount: money.nullable(),
  fees: money.nullable(),
  total: money.refine((n) => n > 0, "Total must be above zero"),
  tip: money.nullable(),
  tipSource: z.enum(["printed", "handwritten", "none"]),
  totalPaid: money.nullable(),
  cardLast4: z.string().regex(/^\d{4}$/).nullable(),
  cardBrand: z.string().max(40).nullable(),
  paymentMethodId: uuidOrEmpty,
  orderType: z.enum(["in_store", "delivery", "pickup", "online"]).nullable(),
  orderNumber: z.string().max(80).nullable(),
  storeAddress: z.string().max(300).nullable(),
  label: z.string().trim().max(120),
  items: z
    .array(
      z.object({
        raw_name: z.string().max(300),
        normalized_name: z.string().max(120).nullable(),
        item_category: z.string().max(60).nullable(),
        quantity: z.number().nullable(),
        unit: z.string().max(20).nullable(),
        unit_price: z.number().nullable(),
        total_price: z.number(),
        list_price: z.number().nullable(),
        line_discount: z.number().nullable(),
        upc: z.string().max(20).nullable(),
        tax_code: z.string().max(10).nullable(),
        is_weighted: z.boolean(),
        category_id: uuidOrEmpty,
        subcategory_id: uuidOrEmpty,
      }),
    )
    .max(300),
});

const cardChoiceSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), paymentMethodId: z.string().uuid() }),
    z.object({ mode: z.literal("new"), name: z.string().trim().min(1).max(60), issuer: z.string().trim().max(60).optional(), network: z.enum(["visa", "mastercard", "amex", "discover", "other"]).optional() }),
  ])
  .optional();

const leftoverSchema = z
  .object({
    kind: z.enum(["tip", "fee"]),
    amount: z.number().positive().max(10_000_000),
    category_id: uuidOrEmpty.optional(),
    subcategory_id: uuidOrEmpty.optional(),
  })
  .nullable();

const outcomeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    category_id: z.string().uuid(),
    subcategory_id: uuidOrEmpty,
    trip_id: uuidOrEmpty.optional(),
    /** tip paid on top of the receipt total: becomes its own Tip transaction */
    tipAmount: z.number().min(0).max(10_000_000).nullable().optional(),
  }),
  z.object({
    type: z.literal("link"),
    links: z
      .array(
        z.object({
          txnId: z.string().uuid(),
          choices: z.object({ merchant: z.enum(["receipt", "txn", "alias"]), currency: z.enum(["receipt", "txn"]), takeDate: z.boolean() }),
          leftover: leftoverSchema,
        }),
      )
      .min(1)
      .max(10),
    /** category for the transaction when one link only; blank keeps the transaction's own */
    category: z.object({ category_id: uuidOrEmpty, subcategory_id: uuidOrEmpty }).nullable().optional(),
    /** transactions already linked to this receipt before this save (split orders) */
    alreadyLinked: z.number().int().min(0).max(10).optional(),
    /** the user says the split order is fully matched */
    markComplete: z.boolean().optional(),
  }),
  z.object({ type: z.literal("park") }),
]);

export type SaveReceiptInput = z.input<typeof draftSchema> & { card?: z.input<typeof cardChoiceSchema>; outcome: z.input<typeof outcomeSchema> };
export type SaveReceiptResult = { ok: true; status: "created" | "linked" | "parked" | "partial"; linked: number; createdTxnIds: string[]; matched?: { matched: number; remaining: number } } | Fail;

export async function saveReceiptAction(input: SaveReceiptInput): Promise<SaveReceiptResult> {
  const { card: cardIn, outcome: outcomeIn, ...draftIn } = input;
  const d0 = draftSchema.safeParse(draftIn);
  const o0 = outcomeSchema.safeParse(outcomeIn);
  const c0 = cardChoiceSchema.safeParse(cardIn);
  if (!d0.success) return { ok: false, error: d0.error.issues[0].message };
  if (!o0.success) return { ok: false, error: o0.error.issues[0].message };
  if (!c0.success) return { ok: false, error: "Check the card details." };
  const d = d0.data;
  const outcome = o0.data;
  const cardChoice = c0.data;

  const { supabase, userId } = await requireUser();
  try {
    const { data: profile } = await supabase.from("profiles").select("base_currency").single();
    const base = profile?.base_currency ?? "USD";
    const rcpt = await supabase.from("receipts").select("id, extracted").eq("id", d.receiptId).maybeSingle();
    if (!rcpt.data) return { ok: false, error: "That receipt no longer exists. Read it again." };

    // 1. card: learn the last 4 on first sight
    let paymentMethodId = d.paymentMethodId;
    if (d.cardLast4 && cardChoice) {
      let pmId: string;
      if (cardChoice.mode === "existing") pmId = cardChoice.paymentMethodId;
      else {
        const ins = await supabase
          .from("payment_methods")
          .insert({ name: cardChoice.name, issuer: cardChoice.issuer || null, network: cardChoice.network ?? networkOf(d.cardBrand), kind: "debit_card", is_credit_card: false })
          .select("id")
          .single();
        if (ins.error) return { ok: false, error: ins.error.code === "23505" ? "A payment method with that name exists. Choose it instead." : ins.error.message };
        pmId = ins.data.id;
      }
      const link = await supabase.from("payment_method_cards").upsert({ user_id: userId, payment_method_id: pmId, last4: d.cardLast4 }, { onConflict: "user_id,last4" });
      if (link.error) return { ok: false, error: link.error.message };
      paymentMethodId = pmId;
    }

    // 2. receipt row (the stored extraction follows the reviewed values, so reopening it from the inbox shows the edits)
    const [catRows, subRows] = await Promise.all([supabase.from("categories").select("id, name"), supabase.from("subcategories").select("id, name")]);
    const catName = new Map((catRows.data ?? []).map((c) => [c.id, c.name]));
    const subName = new Map((subRows.data ?? []).map((c) => [c.id, c.name]));
    const reviewed = extractionFromReview(normalizeExtraction(rcpt.data.extracted), d, (c, sc) => ({ category: catName.get(c) ?? "", subcategory: subName.get(sc) ?? null }));
    const fx = d.currency === base ? 1 : await getRate(d.date, d.currency, base);
    const upd = await supabase
      .from("receipts")
      .update({
        merchant_name: d.merchant || null,
        purchased_at: d.date,
        currency: d.currency,
        subtotal: d.subtotal,
        tax: d.tax,
        discount: d.discount,
        fees: d.fees,
        total: d.total,
        tip: d.tip,
        tip_source: d.tipSource,
        total_paid: d.totalPaid,
        card_last4: d.cardLast4,
        card_brand: d.cardBrand,
        payment_method_id: paymentMethodId || null,
        order_type: d.orderType,
        order_number: d.orderNumber,
        store_address: d.storeAddress,
        label: d.label || null,
        extracted: reviewed as never,
      })
      .eq("id", d.receiptId);
    if (upd.error) return { ok: false, error: upd.error.message };

    const createdTxnIds: string[] = [];
    let linkedIds: string[] = [];
    let firstMerchantId: string | null = null;

    const saveTxn = async (p: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc("save_transaction", { p: p as never });
      if (error) throw new Error(error.message);
      return data as string;
    };

    if (outcome.type === "create") {
      const id = await saveTxn({
        date: d.date,
        type: "expense",
        category_id: outcome.category_id,
        subcategory_id: outcome.subcategory_id,
        merchant_name: d.merchant,
        amount: d.total,
        currency: d.currency,
        fx_rate: fx,
        trip_id: outcome.trip_id ?? "",
        payment_method_id: paymentMethodId,
        receipt_id: d.receiptId,
        source: "receipt",
      });
      createdTxnIds.push(id);
      linkedIds = [id];
      if (outcome.tipAmount && outcome.tipAmount > 0) {
        const tipId = await createLeftover(supabase, { kind: "tip", amount: outcome.tipAmount }, { date: d.date, merchant: d.merchant, currency: d.currency, fx, paymentMethodId });
        createdTxnIds.push(tipId);
      }
    }

    if (outcome.type === "link") {
      const ids = outcome.links.map((l) => l.txnId);
      const { data: rows, error } = await supabase.from("transactions").select("*, merchant:merchants(id, name)").in("id", ids);
      if (error) return { ok: false, error: error.message };
      const split = ids.length + (outcome.alreadyLinked ?? 0) > 1;
      for (const link of outcome.links) {
        const row = rows?.find((r) => r.id === link.txnId);
        if (!row) return { ok: false, error: "A transaction no longer exists. Pick again." };
        if (row.receipt_id && row.receipt_id !== d.receiptId) return { ok: false, error: "A transaction already has a receipt." };
        const merchant = row.merchant as { id: string; name: string } | null;
        const facts = {
          receipt: { merchant: d.merchant || null, date: d.date, total: d.total, tip: d.tip, currency: d.currency, payment_method_id: paymentMethodId || null },
          txn: { merchant: merchant?.name ?? null, date: row.date, amount: Number(row.amount), currency: row.currency.trim(), payment_method_id: row.payment_method_id },
          split,
        };
        const plan = planLink(facts, link.choices);
        const currencyChanged = plan.patch.currency && plan.patch.currency !== facts.txn.currency;
        const nextCurrency = plan.patch.currency ?? facts.txn.currency;
        const nextDate = plan.patch.date ?? row.date;
        const nextFx = currencyChanged ? (nextCurrency === base ? 1 : await getRate(nextDate, nextCurrency, base)) : Number(row.fx_rate);
        const useCategory = !split && outcome.category?.category_id;
        await saveTxn({
          id: row.id,
          date: nextDate,
          type: row.type,
          category_id: useCategory ? outcome.category!.category_id : row.category_id,
          subcategory_id: useCategory ? (outcome.category!.subcategory_id ?? "") : (row.subcategory_id ?? ""),
          merchant_name: plan.patch.merchant_name ?? merchant?.name ?? "",
          description: row.description ?? "",
          external_url: row.external_url ?? "",
          amount: plan.patch.amount ?? Number(row.amount),
          currency: nextCurrency,
          fx_rate: nextFx,
          payment_method_id: plan.patch.payment_method_id ?? row.payment_method_id ?? "",
          paid_by_id: row.paid_by_id ?? "",
          trip_id: row.trip_id ?? "",
          receipt_id: d.receiptId,
          notes: row.notes ?? "",
          plan: { unchanged: true },
        });
        linkedIds.push(row.id);
        firstMerchantId ??= merchant?.id ?? null;
        if (plan.alias && merchant) {
          await supabase.from("merchant_aliases").upsert({ user_id: userId, merchant_id: merchant.id, alias: plan.alias }, { onConflict: "user_id,alias_key", ignoreDuplicates: true });
        }
        if (link.leftover && !split) {
          const id = await createLeftover(supabase, link.leftover, {
            date: plan.patch.date ?? d.date,
            merchant: plan.patch.merchant_name ?? merchant?.name ?? d.merchant,
            currency: nextCurrency,
            fx: nextFx,
            paymentMethodId: plan.patch.payment_method_id ?? row.payment_method_id ?? "",
          });
          createdTxnIds.push(id);
        }
      }
    }

    // 3. items: replaced as one set so a re-save never duplicates
    const del = await supabase.from("receipt_items").delete().eq("receipt_id", d.receiptId);
    if (del.error) return { ok: false, error: del.error.message };
    if (d.items.length) {
      const only = linkedIds.length === 1 && !(outcome.type === "link" && (outcome.alreadyLinked ?? 0) > 0) ? linkedIds[0] : null;
      if (firstMerchantId === null && only) {
        const t = await supabase.from("transactions").select("merchant_id").eq("id", only).single();
        firstMerchantId = t.data?.merchant_id ?? null;
      }
      const ins = await supabase.from("receipt_items").insert(
        d.items.map((i, idx) => ({
          receipt_id: d.receiptId,
          transaction_id: only,
          line_no: idx + 1,
          raw_name: i.raw_name,
          normalized_name: i.normalized_name,
          item_category: i.item_category,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price != null ? Math.round(i.unit_price * fx * 10000) / 10000 : null,
          total_price: Math.round(i.total_price * fx * 100) / 100,
          list_price: i.list_price != null ? Math.round(i.list_price * fx * 100) / 100 : null,
          line_discount: i.line_discount != null ? Math.round(i.line_discount * fx * 100) / 100 : null,
          upc: i.upc,
          tax_code: i.tax_code,
          is_weighted: i.is_weighted,
          purchased_at: d.date,
          merchant_id: firstMerchantId,
        })),
      );
      if (ins.error) return { ok: false, error: ins.error.message };
    }

    // 4. receipt status: inbox while parked or only partly matched
    let status: "created" | "linked" | "parked" | "partial" = outcome.type === "create" ? "created" : outcome.type === "park" ? "parked" : "linked";
    let matched: { matched: number; remaining: number } | undefined;
    let complete = outcome.type !== "park";
    if (outcome.type === "link" && linkedIds.length + (outcome.alreadyLinked ?? 0) > 1) {
      const all = await supabase.from("transactions").select("amount, currency").eq("receipt_id", d.receiptId);
      const same = (all.data ?? []).filter((t) => t.currency.trim() === d.currency).map((t) => ({ amount: Number(t.amount) }));
      const m = matchedSoFar(d.total, same);
      matched = { matched: m.matched, remaining: m.remaining };
      complete = m.complete || !!outcome.markComplete;
      if (!complete) status = "partial";
    }
    const fin = await supabase
      .from("receipts")
      .update({ status: complete ? "parsed" : "inbox", match_complete: complete && outcome.type !== "park" })
      .eq("id", d.receiptId);
    if (fin.error) return { ok: false, error: fin.error.message };

    revalidatePath("/", "layout");
    return { ok: true, status, linked: linkedIds.length, createdTxnIds, matched };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * Bulk upload: a freshly read receipt goes straight to the inbox, unreviewed. A receipt that is already linked or already
 * in the inbox (the same files read before) is left alone. A missing date takes the file's date so the inbox can sort it.
 */
export async function parkReadReceiptAction(input: { receiptId: string; date?: string }): Promise<{ ok: true; state: "parked" | "already" } | Fail> {
  if (!z.string().uuid().safeParse(input.receiptId).success) return { ok: false, error: "Invalid receipt." };
  try {
    const { supabase } = await requireUser();
    const row = await supabase.from("receipts").select("id, status, purchased_at").eq("id", input.receiptId).maybeSingle();
    if (!row.data) return { ok: false, error: "That receipt no longer exists." };
    if (row.data.status === "inbox") return { ok: true, state: "already" };
    const linked = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("receipt_id", input.receiptId);
    if ((linked.count ?? 0) > 0) return { ok: true, state: "already" };
    const date = !row.data.purchased_at && input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : undefined;
    const upd = await supabase.from("receipts").update({ status: "inbox", match_complete: false, ...(date ? { purchased_at: date } : {}) }).eq("id", input.receiptId);
    if (upd.error) return { ok: false, error: upd.error.message };
    revalidatePath("/", "layout");
    return { ok: true, state: "parked" };
  } catch (e) {
    return failOf(e);
  }
}

/** Second transaction for what the receipt does not cover: same date, merchant, card and currency, no receipt link. */
async function createLeftover(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  l: { kind: "tip" | "fee"; amount: number; category_id?: string; subcategory_id?: string },
  at: { date: string; merchant: string; currency: string; fx: number; paymentMethodId: string },
): Promise<string> {
  let category_id = l.category_id ?? "";
  let subcategory_id = l.subcategory_id ?? "";
  if (l.kind === "tip") {
    const tip = await supabase.rpc("ensure_tip_subcategory");
    const row = tip.data?.[0];
    if (!row) throw new Error("Add a Dining & Drinks category first, or pick Fee and choose a category for the tip.");
    category_id = row.category_id;
    subcategory_id = row.subcategory_id;
  } else if (!category_id) {
    throw new Error("Pick a category for the missing fee or tax.");
  }
  const { data, error } = await supabase.rpc("save_transaction", {
    p: {
      date: at.date,
      type: "expense",
      category_id,
      subcategory_id,
      merchant_name: at.merchant,
      description: l.kind === "tip" ? "Tip" : "Fee or tax missing from receipt",
      amount: l.amount,
      currency: at.currency,
      fx_rate: at.fx,
      payment_method_id: at.paymentMethodId,
      source: "receipt",
    } as never,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** After a statement import: how many parked receipts now have a likely transaction. */
export async function inboxMatchCountAction(): Promise<{ receipts: number; matches: number }> {
  try {
    const { supabase } = await requireUser();
    const { data: profile } = await supabase.from("profiles").select("base_currency").single();
    const inbox = await loadInbox(supabase, profile?.base_currency ?? "USD");
    const hit = inbox.filter((r) => r.suggestions > 0);
    return { receipts: hit.length, matches: hit.reduce((a, r) => a + r.suggestions, 0) };
  } catch {
    return { receipts: 0, matches: 0 };
  }
}

// ---------------------------------------------------------------------------
// Delete (inbox)
// ---------------------------------------------------------------------------
export async function deleteReceiptAction(receiptId: string): Promise<{ ok: true; unlinked: number } | Fail> {
  if (!z.string().uuid().safeParse(receiptId).success) return { ok: false, error: "Invalid receipt." };
  try {
    const { supabase } = await requireUser();
    const row = await supabase.from("receipts").select("id, storage_path").eq("id", receiptId).maybeSingle();
    if (!row.data) return { ok: false, error: "That receipt no longer exists." };
    const pages = await supabase.from("receipt_pages").select("storage_path").eq("receipt_id", receiptId);
    const paths = [...new Set([...(pages.data ?? []).map((p) => p.storage_path), ...(row.data.storage_path ? [row.data.storage_path] : [])])];
    const linked = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("receipt_id", receiptId);
    // pages and items go with the receipt; linked transactions keep everything but the link (FK sets receipt_id null)
    const del = await supabase.from("receipts").delete().eq("id", receiptId);
    if (del.error) return { ok: false, error: del.error.message };
    // a file shared with another receipt (same page hash) stays
    const unused: string[] = [];
    for (const path of paths) {
      const [a, b] = await Promise.all([
        supabase.from("receipt_pages").select("receipt_id", { count: "exact", head: true }).eq("storage_path", path),
        supabase.from("receipts").select("id", { count: "exact", head: true }).eq("storage_path", path),
      ]);
      if ((a.count ?? 0) === 0 && (b.count ?? 0) === 0) unused.push(path);
    }
    if (unused.length) await supabase.storage.from(BUCKET).remove(unused);
    revalidatePath("/", "layout");
    return { ok: true, unlinked: linked.count ?? 0 };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Unlink
// ---------------------------------------------------------------------------
export async function unlinkReceiptAction(txnId: string): Promise<{ ok: true } | Fail> {
  if (!z.string().uuid().safeParse(txnId).success) return { ok: false, error: "Invalid transaction." };
  try {
    const { supabase } = await requireUser();
    const t = await supabase.from("transactions").select("receipt_id").eq("id", txnId).single();
    if (t.error || !t.data.receipt_id) return { ok: false, error: "This transaction has no receipt." };
    const rid = t.data.receipt_id;
    const up = await supabase.from("transactions").update({ receipt_id: null }).eq("id", txnId);
    if (up.error) return { ok: false, error: up.error.message };
    // the receipt goes back to the inbox only when nothing else still points at it
    const left = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("receipt_id", rid);
    await supabase.from("receipt_items").update({ transaction_id: null }).eq("transaction_id", txnId);
    if ((left.count ?? 0) === 0) await supabase.from("receipts").update({ status: "inbox", match_complete: false }).eq("id", rid);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
