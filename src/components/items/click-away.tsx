"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Clears the selected item when you click anywhere outside the parts marked `data-keep` (the item list and the item's detail card).
 * Renders nothing; it only listens while an item is selected.
 */
export function ClickAway({ active, href }: { active: boolean; href: string }) {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest("[data-keep]")) return;
      router.replace(href || path, { scroll: false });
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active, href, path, router]);
  return null;
}
