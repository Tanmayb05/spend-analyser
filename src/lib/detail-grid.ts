/**
 * Two-column packing for the transaction detail fields, so the grid never has a hole: fields marked `wide` take the full row,
 * and a half-width field that has no partner (the next field is wide, or it is the last) stretches across the row.
 */
export type GridField = { key: string; wide?: boolean };
export type PackedField = { key: string; span: 1 | 2 };

export function packFields(fields: GridField[]): PackedField[] {
  const out: PackedField[] = [];
  let pending: PackedField | null = null;
  for (const f of fields) {
    if (f.wide) {
      if (pending) {
        pending.span = 2;
        pending = null;
      }
      out.push({ key: f.key, span: 2 });
    } else if (pending) {
      out.push({ key: f.key, span: 1 });
      pending = null;
    } else {
      pending = { key: f.key, span: 1 };
      out.push(pending);
    }
  }
  if (pending) pending.span = 2;
  return out;
}

/** Text this long reads badly in half a row, so it gets the whole row. */
export const WIDE_TEXT = 30;
