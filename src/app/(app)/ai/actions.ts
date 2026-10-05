"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { AiError, generateJson } from "@/lib/ai/gemini";
import { analysisSchema, parseTextSchema, receiptSchema, type Analysis, type ReceiptExtraction } from "@/lib/ai/schemas";
import { buildAnalysisInput } from "@/lib/ai/aggregates";
import { fetchDriveFile, MAX_BYTES, sniffMime } from "@/lib/receipts/fetch";
import { allocate } from "@/lib/receipts/allocate";
import { getRate } from "@/lib/fx";
import { todayIn } from "@/lib/dates";
import type { Category, Subcategory } from "@/lib/data/types";

type Fail = { ok: false; error: string };
const failOf = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// ---------------------------------------------------------------------------
// shared context
// ---------------------------------------------------------------------------
async function context() {
  const { supabase, userId } = await requireUser();
  const [profile, categories, subcategories, merchants, trips] = await Promise.all([
    supabase.from("profiles").select("base_currency, timezone").eq("id", userId).single(),
    supabase.from("categories").select("*").eq("archived", false).order("sort_order"),
    supabase.from("subcategories").select("*").eq("archived", false),
    supabase.from("merchants").select("id, name").order("created_at", { ascending: false }).limit(300),
    supabase.from("trips").select("id, name, start_date, end_date").order("start_date", { ascending: false, nullsFirst: true }).limit(20),
  ]);
  const cats = categories.data ?? [];
  const subs = subcategories.data ?? [];
  return {
    supabase,
    userId,
    base: profile.data?.base_currency ?? "USD",
    today: todayIn(profile.data?.timezone ?? "UTC"),
    cats,
    subs,
    merchants: merchants.data ?? [],
    trips: trips.data ?? [],
  };
}

function categoryList(cats: Category[], subs: Subcategory[], kind?: "expense" | "income") {
  return cats
    .filter((c) => !kind || c.kind === kind)
    .map((c) => `- ${c.name} (${c.kind})${subs.some((s) => s.category_id === c.id) ? `: ${subs.filter((s) => s.category_id === c.id).map((s) => s.name).join(", ")}` : ""}`)
    .join("\n");
}

function matchCategory(cats: Category[], subs: Subcategory[], name: string | null, subName: string | null) {
  const c = cats.find((x) => x.name.toLowerCase() === (name ?? "").toLowerCase());
  const s = c ? subs.find((x) => x.category_id === c.id && x.name.toLowerCase() === (subName ?? "").toLowerCase()) : undefined;
  return { category_id: c?.id ?? "", subcategory_id: s?.id ?? "" };
}

// ---------------------------------------------------------------------------
// Text → transactions
// ---------------------------------------------------------------------------
export type TxnPreset = Record<string, string>;

export async function parseTextAction(text: string): Promise<{ ok: true; presets: TxnPreset[]; note: string | null; remaining: number } | Fail> {
  const t = z.string().trim().min(2).max(500).safeParse(text);
  if (!t.success) return { ok: false, error: "Type a short description, e.g. “12.50 Kroger groceries yesterday”." };
  try {
    const ctx = await context();
    const system = [
      "You turn short notes about money into structured transactions for a personal finance app.",
      `Today is ${ctx.today}. Default currency: ${ctx.base}.`,
      "Pick category and subcategory only from the list. Income (salary, refunds from employer, cashback) uses income categories.",
      "If the note lists several purchases, return several transactions. Never invent amounts.",
    ].join("\n");
    const prompt = [
      `Categories:\n${categoryList(ctx.cats, ctx.subs)}`,
      `Known merchants: ${ctx.merchants.map((m) => m.name).join(", ") || "none"}`,
      `Trips: ${ctx.trips.map((tr) => `${tr.name} (${tr.start_date ?? "?"}–${tr.end_date ?? "?"})`).join("; ") || "none"}`,
      `Note: """${t.data}"""`,
    ].join("\n\n");
    const { data, remaining } = await generateJson({ feature: "parse_text", system, parts: [{ text: prompt }], schema: parseTextSchema });
    const presets = data.transactions.map((p) => {
      const m = matchCategory(ctx.cats, ctx.subs, p.category, p.subcategory);
      const trip = ctx.trips.find((tr) => tr.name.toLowerCase() === (p.trip ?? "").toLowerCase());
      return {
        date: p.date,
        type: p.type,
        amount: String(p.amount),
        currency: p.currency,
        ...m,
        merchant_name: p.merchant ?? "",
        description: p.description ?? "",
        trip_id: trip?.id ?? "",
        source: "text",
      };
    });
    return { ok: true, presets, note: data.note, remaining };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Receipt → extraction (+ stored file)
// ---------------------------------------------------------------------------
export type ReceiptItemDraft = ReceiptExtraction["items"][number] & { category_id: string; subcategory_id: string };
export type ReceiptDraft = {
  receiptId: string;
  fileUrl: string | null;
  merchant: string;
  date: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  items: ReceiptItemDraft[];
  cached: boolean;
  remaining: number | null;
};

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic" };

export async function parseReceiptAction(input: { storagePath?: string; driveUrl?: string; fileName?: string }): Promise<{ ok: true; draft: ReceiptDraft } | Fail> {
  try {
    const ctx = await context();
    const { supabase, userId } = ctx;
    let bytes: Uint8Array;
    let name = input.fileName ?? null;
    let sourceUrl: string | null = null;

    if (input.driveUrl) {
      const f = await fetchDriveFile(input.driveUrl);
      bytes = f.bytes;
      name = f.name ?? name;
      sourceUrl = input.driveUrl.trim();
    } else if (input.storagePath) {
      if (!input.storagePath.startsWith(`${userId}/`) || input.storagePath.includes("..")) return { ok: false, error: "Invalid file." };
      const dl = await supabase.storage.from("receipts").download(input.storagePath);
      if (dl.error || !dl.data) return { ok: false, error: "Upload not found. Try again." };
      if (dl.data.size > MAX_BYTES) return { ok: false, error: "File is larger than 10 MB." };
      bytes = new Uint8Array(await dl.data.arrayBuffer());
    } else {
      return { ok: false, error: "Choose a file or paste a Drive link." };
    }

    const mime = sniffMime(bytes);
    if (!mime) return { ok: false, error: "Only PDF, PNG, JPG, WEBP or HEIC receipts are supported." };
    const sha = createHash("sha256").update(bytes).digest("hex");
    const path = `${userId}/${sha}.${EXT[mime]}`;

    // store the file under its hash (idempotent)
    if (input.storagePath !== path) {
      const up = await supabase.storage.from("receipts").upload(path, bytes, { contentType: mime, upsert: true });
      if (up.error) return { ok: false, error: `Couldn't store the file: ${up.error.message}` };
      if (input.storagePath) await supabase.storage.from("receipts").remove([input.storagePath]);
    }
    const signed = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);

    // dedupe: same file already read → reuse the extraction (no AI call)
    const existing = await supabase.from("receipts").select("*").eq("sha256", sha).maybeSingle();
    let receiptId = existing.data?.id ?? null;
    let extraction = existing.data?.status === "parsed" ? (existing.data.extracted as ReceiptExtraction | null) : null;
    let remaining: number | null = null;

    if (!receiptId) {
      const ins = await supabase
        .from("receipts")
        .insert({ storage_path: path, file_name: name, mime, sha256: sha, source_url: sourceUrl, status: "pending" })
        .select("id")
        .single();
      if (ins.error) return { ok: false, error: ins.error.message };
      receiptId = ins.data.id;
    }

    if (!extraction) {
      const system = [
        "You read shopping receipts and invoices for a personal finance app. Extract exactly what is printed; never invent lines.",
        `If no currency symbol is visible assume ${ctx.base}. Dates must be YYYY-MM-DD.`,
        "For each line item choose the best matching expense category/subcategory from the list.",
        "Skip non-item lines (subtotal, tax, payment, change, loyalty points) from items.",
      ].join("\n");
      const res = await generateJson({
        feature: "parse_receipt",
        system,
        parts: [
          { inlineData: { mimeType: mime, data: Buffer.from(bytes).toString("base64") } },
          { text: `Expense categories:\n${categoryList(ctx.cats, ctx.subs, "expense")}\n\nKnown merchants: ${ctx.merchants.map((m) => m.name).join(", ")}` },
        ],
        schema: receiptSchema,
      });
      extraction = res.data;
      remaining = res.remaining;
      await supabase
        .from("receipts")
        .update({
          status: "parsed",
          merchant_name: extraction.merchant,
          purchased_at: extraction.date,
          currency: extraction.currency,
          subtotal: extraction.subtotal,
          tax: extraction.tax,
          discount: extraction.discount,
          total: extraction.total,
          extracted: extraction as never,
          storage_path: path,
          source_url: sourceUrl ?? existing.data?.source_url ?? null,
          error: null,
        })
        .eq("id", receiptId);
    }

    const itemsSum = extraction.items.reduce((a, i) => a + i.total_price, 0);
    return {
      ok: true,
      draft: {
        receiptId,
        fileUrl: signed.data?.signedUrl ?? null,
        merchant: extraction.merchant ?? "",
        date: extraction.date ?? ctx.today,
        currency: extraction.currency ?? ctx.base,
        subtotal: extraction.subtotal,
        tax: extraction.tax,
        discount: extraction.discount,
        total: extraction.total ?? Math.round(itemsSum * 100) / 100,
        items: extraction.items.map((i) => ({ ...i, ...matchCategory(ctx.cats, ctx.subs, i.category, i.subcategory) })),
        cached: remaining === null,
        remaining,
      },
    };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message };
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Save reviewed receipt → transactions + line items
// ---------------------------------------------------------------------------
const saveSchema = z.object({
  receiptId: z.string().uuid(),
  merchant: z.string().trim().max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  total: z.number().positive(),
  mode: z.enum(["single", "split"]),
  single: z.object({ category_id: z.string().uuid(), subcategory_id: z.string().uuid().or(z.literal("")) }).optional(),
  trip_id: z.string().uuid().or(z.literal("")).optional(),
  payment_method_id: z.string().uuid().or(z.literal("")).optional(),
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
        category_id: z.string().uuid().or(z.literal("")),
        subcategory_id: z.string().uuid().or(z.literal("")),
      }),
    )
    .max(300),
});

export async function saveReceiptAction(input: z.input<typeof saveSchema>): Promise<{ ok: true; count: number } | Fail> {
  const v = saveSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0].message };
  const p = v.data;
  const { supabase } = await requireUser();
  try {
    const { data: profile } = await supabase.from("profiles").select("base_currency").single();
    const base = profile?.base_currency ?? "USD";
    const fx = p.currency === base ? 1 : await getRate(p.date, p.currency, base);

    // groups: one transaction per category (split) or one for everything (single)
    const keyOf = (i: (typeof p.items)[number]) => (p.mode === "single" ? "single" : `${i.category_id}|${i.subcategory_id}`);
    if (p.mode === "split" && p.items.some((i) => !i.category_id)) return { ok: false, error: "Pick a category for every item." };
    if (p.mode === "single" && !p.single?.category_id) return { ok: false, error: "Pick a category." };
    const parts = p.items.length
      ? allocate(p.items.map((i) => ({ key: keyOf(i), total_price: i.total_price })), p.total)
      : [{ key: "single", amount: p.total, itemsSum: p.total }];
    if (!parts.length) parts.push({ key: "single", amount: p.total, itemsSum: p.total });

    // re-saving replaces the earlier transactions for this receipt
    await supabase.from("receipt_items").delete().eq("receipt_id", p.receiptId);
    await supabase.from("transactions").delete().eq("receipt_id", p.receiptId);

    const txnByKey = new Map<string, string>();
    for (const part of parts) {
      const [cat, sub] = part.key === "single" ? [p.single!.category_id, p.single!.subcategory_id] : part.key.split("|");
      const groupItems = p.items.filter((i) => keyOf(i) === part.key);
      const names = groupItems.map((i) => i.normalized_name || i.raw_name);
      const description = names.length ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3} more` : ""}` : "";
      const { data: id, error } = await supabase.rpc("save_transaction", {
        p: {
          date: p.date,
          type: "expense",
          category_id: cat,
          subcategory_id: sub ?? "",
          merchant_name: p.merchant,
          description,
          amount: part.amount,
          currency: p.currency,
          fx_rate: fx,
          trip_id: p.trip_id ?? "",
          payment_method_id: p.payment_method_id ?? "",
          receipt_id: p.receiptId,
          source: "receipt",
        },
      });
      if (error) return { ok: false, error: error.message };
      txnByKey.set(part.key, id);
    }

    const firstTxn = await supabase.from("transactions").select("merchant_id").eq("id", [...txnByKey.values()][0]).single();
    if (p.items.length) {
      const { error } = await supabase.from("receipt_items").insert(
        p.items.map((i, idx) => ({
          receipt_id: p.receiptId,
          transaction_id: txnByKey.get(keyOf(i)) ?? null,
          line_no: idx + 1,
          raw_name: i.raw_name,
          normalized_name: i.normalized_name,
          item_category: i.item_category,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price != null ? Math.round(i.unit_price * fx * 10000) / 10000 : null,
          total_price: Math.round(i.total_price * fx * 100) / 100,
          purchased_at: p.date,
          merchant_id: firstTxn.data?.merchant_id ?? null,
        })),
      );
      if (error) return { ok: false, error: error.message };
    }
    await supabase.from("receipts").update({ merchant_name: p.merchant, purchased_at: p.date, total: p.total, currency: p.currency }).eq("id", p.receiptId);

    revalidatePath("/", "layout");
    return { ok: true, count: txnByKey.size };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Deep analysis (cached)
// ---------------------------------------------------------------------------
const scopeSchema = z.object({ scope: z.enum(["month", "quarter", "year"]), month: z.string().regex(/^\d{4}-\d{2}-01$/), mode: z.enum(["normalized", "cash"]) });
export type AnalysisScope = z.infer<typeof scopeSchema>;

export async function runAnalysisAction(input: AnalysisScope): Promise<{ ok: true; result: Analysis; remaining: number } | Fail> {
  const v = scopeSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid scope" };
  try {
    const { supabase } = await requireUser();
    const { payload, fingerprint, currency } = await buildAnalysisInput(v.data);
    if (!payload.months.some((m) => m.spent > 0 || m.income > 0)) return { ok: false, error: "Not enough data in this period to analyse." };
    const system = [
      "You are a careful personal-finance analyst. Write for a non-expert: short sentences, concrete numbers, no jargon.",
      `All amounts are in ${currency}. 'Core' = everyday controllable spending; fixed costs (rent, tuition, travel) are not core.`,
      "Each insight must be meaningful and actionable, citing figures from the data. Do not give investment advice.",
      "Normalized mode spreads EMIs/big purchases over months; cash mode shows money when it left.",
    ].join("\n");
    const { data, remaining } = await generateJson({
      feature: "analysis",
      model: "smart",
      system,
      parts: [{ text: `Data (JSON):\n${JSON.stringify(payload)}` }],
      schema: analysisSchema,
      temperature: 0.3,
    });
    const scopeKey = `${v.data.scope}|${v.data.month}|${v.data.mode}`;
    await supabase.from("ai_insights").insert({ scope_key: scopeKey, scope: { ...v.data, fingerprint } as never, result: data as never, model: "smart" });
    revalidatePath("/insights");
    return { ok: true, result: data, remaining };
  } catch (e) {
    return failOf(e);
  }
}
