import { cn } from "@/lib/utils";

export const DEMO_VIDEO = { src: "/demo.mp4", poster: "/demo.jpg", seconds: 25 } as const;

/**
 * The 25-second product tour (music only, no narration; the steps on the About page carry the same content as text).
 * Never autoplays: the viewer presses play.
 */
export function DemoVideo({ className }: { className?: string }) {
  return (
    <video
      src={DEMO_VIDEO.src}
      poster={DEMO_VIDEO.poster}
      controls
      playsInline
      preload="metadata"
      aria-label="Spend Analyser tour: a typed sentence becomes two transactions, a receipt is read, a question about spending is answered, then the money flow, trips and credit cards"
      className={cn("aspect-video w-full rounded-inset border border-border bg-bg", className)}
    />
  );
}
