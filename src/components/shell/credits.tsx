import { AUTHOR_NAME, PORTFOLIO_URL, REPO_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

const LINK = "w-fit underline-offset-2 transition-colors duration-(--dur-fast) hover:text-text hover:underline";

/**
 * Source code and author links. Small and quiet: it sits under navigation, never competes with it.
 * `stacked` puts them on two lines (narrow sidebar), otherwise one line with a dot between.
 */
export function Credits({ className, stacked = false }: { className?: string; stacked?: boolean }) {
  return (
    <p className={cn("flex text-xs text-faint", stacked ? "flex-col gap-1" : "flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        Source on GitHub
      </a>
      {stacked ? null : <span aria-hidden="true">·</span>}
      <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        Made by {AUTHOR_NAME}
      </a>
    </p>
  );
}
