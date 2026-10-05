import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { EXPORT_COLUMNS, exportRows, type ExportTxn } from "@/lib/export";

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const tables = ["profiles", "categories", "subcategories", "budgets", "payment_methods", "people", "merchants", "trips", "receipts", "transactions", "spread_plans", "installments", "receipt_items"] as const;
    const backup: Record<string, unknown[]> = {};
    for (const t of tables) backup[t] = await fetchAll((a, b) => supabase.from(t).select("*").range(a, b));
    return new NextResponse(JSON.stringify({ version: 1, exported_at: new Date().toISOString(), ...backup }, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="spend-analyser-backup-${stamp}.json"` },
    });
  }

  const { data: profile } = await supabase.from("profiles").select("base_currency").single();
  const base = profile?.base_currency ?? "USD";
  type Plan = { kind: "spread" | "emi"; installments: { seq: number; due_date: string; amount_base: number }[] };
  type Row = {
    date: string; type: string; amount: number; currency: string; base_amount: number; description: string | null; notes: string | null;
    categories: { name: string } | null; subcategories: { name: string } | null; merchants: { name: string } | null;
    payment_methods: { name: string } | null; people: { name: string } | null; trips: { name: string } | null; receipts: { file_name: string | null; source_url: string | null } | null;
    spread_plans: Plan | Plan[] | null;
  };
  const rows = await fetchAll<Row>((a, b) => {
    let q = supabase
      .from("transactions")
      .select("date,type,amount,currency,base_amount,description,notes,categories(name),subcategories(name),merchants(name),payment_methods(name),people(name),trips(name),receipts(file_name,source_url),spread_plans(kind,installments(seq,due_date,amount_base))")
      .order("date");
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    return q.range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  });

  const planOf = (r: Row): Plan | null => (Array.isArray(r.spread_plans) ? r.spread_plans[0] ?? null : r.spread_plans);
  const txns: ExportTxn[] = rows.map((r) => ({
    date: r.date,
    type: r.type,
    category: r.categories?.name ?? "",
    subcategory: r.subcategories?.name ?? null,
    merchant: r.merchants?.name ?? null,
    description: r.description,
    amount: Number(r.amount),
    currency: r.currency,
    base_amount: Number(r.base_amount),
    payment: r.payment_methods?.name ?? null,
    paid_by: r.people?.name ?? null,
    trip: r.trips?.name ?? null,
    receipt: r.receipts?.source_url ?? r.receipts?.file_name ?? null,
    notes: r.notes,
    plan: (() => {
      const p = planOf(r);
      return p ? { kind: p.kind, installments: [...(p.installments ?? [])].sort((a, b) => a.seq - b.seq) } : null;
    })(),
  }));
  const table = [EXPORT_COLUMNS as unknown as string[], ...exportRows(txns, base)];

  if (format === "csv") {
    return new NextResponse(Papa.unparse(table), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="expenses-${stamp}.csv"` },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(table);
  ws["!cols"] = EXPORT_COLUMNS.map((c) => ({ wch: c === "Description" ? 40 : c === "Date" ? 12 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="expenses-${stamp}.xlsx"`,
    },
  });
}
