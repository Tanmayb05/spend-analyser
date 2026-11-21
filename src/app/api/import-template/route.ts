import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { CLEAN_CHECKLIST, COLUMN_GUIDE, TEMPLATE_COLUMNS, templateRows } from "@/lib/import/template";

/** Sample import file: same columns the importer reads, with example rows. Static content. */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  const table = [[...TEMPLATE_COLUMNS], ...templateRows()];

  if (format === "csv") {
    return new NextResponse(Papa.unparse(table), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="import-sample.csv"' },
    });
  }
  if (format !== "xlsx") return NextResponse.json({ error: "format must be xlsx or csv" }, { status: 400 });

  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet(table);
  data["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c === "Description" ? 40 : c === "Date" ? 12 : 16 }));
  XLSX.utils.book_append_sheet(wb, data, "Expenses");

  const guide = XLSX.utils.aoa_to_sheet([
    ["How to fill the Expenses sheet"],
    [],
    ["Column", "Needed", "What it accepts", "Example"],
    ...COLUMN_GUIDE.map((g) => [g.column, g.required, g.accepts, g.example]),
    [],
    ["Before you import"],
    ...CLEAN_CHECKLIST.map((c) => [c]),
  ]);
  guide["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 90 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, guide, "How to fill");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="import-sample.xlsx"',
    },
  });
}
