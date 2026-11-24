"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { faceFill } from "./card-face";
import { cn } from "@/lib/utils";

export type WalletItem = { id: string; name: string; color: string | null };

// Pixel geometry: every card is CARD_H tall but only its top STRIP shows (the name); the wallet front hides the rest.
// Rule: a card's bottom must stay behind the front, i.e. top + CARD_H <= area + FRONT_H, in both states.
const STRIP = 44;
const CARD_H = 96;
const FRONT_H = 112;
const TOP = 12;
/** Closed: the cards sink into the pocket, leaving only a few thin edges showing above the front. */
const CLOSED_AREA = 24;

/**
 * A wallet with the cards inside. Closed, it is a flat pouch with the card edges peeking out. Tap it and the cards slide up
 * so each card's name shows; tap a card to open it on the Cards tab.
 */
export function WalletStack({ items }: { items: WalletItem[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const n = items.length;
  const area = open ? TOP + n * STRIP : CLOSED_AREA;
  const cardTop = (i: number) => (open ? TOP + i * STRIP : CLOSED_AREA - 8 - Math.min(n - 1 - i, 2) * 4);
  const ease = "transition-[top] duration-(--dur-slow) motion-reduce:transition-none";

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative transition-[height] duration-(--dur-slow) motion-reduce:transition-none" style={{ height: area + FRONT_H }}>
        {/* back of the wallet: the cards sit inside it */}
        <span aria-hidden className="absolute inset-0 rounded-card border border-border bg-surface-2" />
        <ul id={listId} inert={!open} className="absolute inset-0">
          {items.map((it, i) => {
            const fill = faceFill(it.color);
            // stagger: cards leave the pocket top first, and return last
            const delay = `${(open ? i : n - 1 - i) * 30}ms`;
            return (
              <li key={it.id} className={cn("absolute inset-x-4", ease)} style={{ top: cardTop(i), height: CARD_H, zIndex: i, transitionDelay: delay }}>
                <Link
                  href={`/transactions?tab=cards#card-${it.id}`}
                  className={cn("block h-full rounded-card px-4 pt-3 text-bg ring-1 ring-inset ring-bg/20", fill.className)}
                  style={fill.style}
                >
                  <span className="block truncate text-sm font-medium">{it.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between rounded-card border border-border bg-surface-3 px-card text-left"
          style={{ height: FRONT_H }}
        >
          {/* stitching */}
          <span aria-hidden className="pointer-events-none absolute inset-1.5 rounded-inset border border-dashed border-text/15" />
          <span className="relative">
            <span className="block font-medium">Wallet</span>
            <span className="block text-xs text-muted">{n} {n === 1 ? "card" : "cards"}{open ? "" : " · tap to open"}</span>
          </span>
          <ChevronUp size={18} aria-hidden className={cn("relative text-muted transition-transform duration-(--dur-base) motion-reduce:transition-none", !open && "rotate-180")} />
          {/* snap tab */}
          <span aria-hidden className="absolute right-0 top-1/2 h-8 w-2 -translate-y-1/2 rounded-l-inset bg-text" />
        </button>
      </div>
      <div className="mt-4 text-right text-sm">
        <Link href="/transactions?tab=cards" className="text-muted hover:text-text">All cards, bills and limits</Link>
      </div>
    </div>
  );
}
