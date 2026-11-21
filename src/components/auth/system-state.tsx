import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty";

/** A link that looks like <Button> (primary, md): a button cannot sit inside a link. */
export function HomeLink({ children = "Go to dashboard" }: { children?: ReactNode }) {
  return (
    <Link
      href="/"
      className="inline-flex h-11 shrink-0 items-center justify-center rounded-control bg-text px-4 text-sm font-medium text-bg transition-[background-color,opacity,transform] hover:opacity-90 active:scale-[0.98]"
    >
      {children}
    </Link>
  );
}

/**
 * Not-found, error and global-error share this: what happened in one line, one action.
 * `inShell` sits inside the app shell's content area; otherwise it fills the viewport (auth pages, root errors).
 */
export function SystemState({ title, body, action, inShell = false }: { title: string; body?: ReactNode; action?: ReactNode; inShell?: boolean }) {
  return (
    <div className={inShell ? "mx-auto w-full max-w-md py-page" : "grid min-h-dvh place-items-center px-compact py-10"}>
      <div className="w-full max-w-md">
        <EmptyState title={title} body={body} action={action} />
      </div>
    </div>
  );
}
