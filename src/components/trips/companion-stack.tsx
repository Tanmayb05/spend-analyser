import { companionStack } from "@/lib/companions";
import { cn } from "@/lib/utils";

/** Overlapping initials for the people on a trip, built from the free-text "With" field. Four at most, then "+N". Each tint is a chart token picked from the name. */
export function CompanionStack({ companions, className }: { companions: string | null | undefined; className?: string }) {
  const { shown, extra, all } = companionStack(companions, 4);
  if (!shown.length) return null;
  const chip = "grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium ring-2 ring-surface";
  return (
    <span role="img" aria-label={`With ${all.join(", ")}`} title={all.join(", ")} className={cn("flex shrink-0 items-center -space-x-2", className)}>
      {shown.map((p) => (
        <span
          key={p.name}
          aria-hidden
          className={chip}
          style={{
            background: `color-mix(in srgb, var(--c${p.color}) 25%, var(--surface))`,
            color: `color-mix(in srgb, var(--c${p.color}) 55%, var(--text))`,
          }}
        >
          {p.initials}
        </span>
      ))}
      {extra ? (
        <span aria-hidden className={cn(chip, "bg-surface-3 text-muted")}>+{extra}</span>
      ) : null}
    </span>
  );
}
