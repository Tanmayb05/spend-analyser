export type EntryMethod = "ai" | "manual";
export type EntryMode = "ai" | "manual" | "receipt";

export const parseEntryMethod = (v: unknown): EntryMethod => (v === "manual" ? "manual" : "ai");

/**
 * Which screen "Add transaction" opens.
 * Editing, or any preset (Plans, Trips, Duplicate), always gets the form. The receipt button gets the receipt flow.
 * Otherwise the saved default applies, unless the user switched inside the sheet. AI falls back to the form when it isn't ready.
 */
export function resolveEntryMode({
  editId,
  preset,
  defaultMethod,
  aiReady,
  override,
}: {
  editId?: string;
  preset?: Record<string, string>;
  defaultMethod: EntryMethod;
  aiReady: boolean;
  override?: EntryMethod | null;
}): EntryMode {
  if (editId) return "manual";
  if (preset?.__receipt === "1") return "receipt";
  if (preset && Object.keys(preset).length > 0) return "manual";
  const wanted = override ?? defaultMethod;
  return wanted === "ai" && aiReady ? "ai" : "manual";
}
