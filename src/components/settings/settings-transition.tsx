"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

/** Side pane: 16rem panel + 1.5rem gap. */
export const PANE_WIDTH = 280;
/** How far the pane's contents travel while it slides in. */
export const PANE_SLIDE = 20;
export const PANE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PANE_MS = 380;
const FLIGHT_MS = 520;

type Flight = {
  href: string;
  Icon: LucideIcon;
  left: number;
  top: number;
  size: number;
  dx: number;
  dy: number;
  scale: number;
  bg: [string, string];
  fg: [string, string];
};

type Ctx = {
  /** Settings-home tile click. Returns true when it took over navigation (animated); false = let the link navigate normally. */
  launch: (href: string, circle: HTMLElement, Icon: LucideIcon) => boolean;
  /** Pane is showing: on any setting page, and during the opening animation. */
  paneOpen: boolean;
  /** Collapse/expand without animating (landing on the Settings home, e.g. via Back). */
  paneInstant: boolean;
  paneTransition: string;
  /** The pane icon the circle is currently flying to (kept hidden until it lands). */
  flyingHref: string | null;
  /** The tile that was clicked, until the new page is on screen. */
  launchedHref: string | null;
};

const SettingsTransitionContext = createContext<Ctx>({
  launch: () => false,
  paneOpen: false,
  paneInstant: true,
  paneTransition: "none",
  flyingHref: null,
  launchedHref: null,
});
export const useSettingsTransition = () => useContext(SettingsTransitionContext);

/**
 * Wraps the Settings section (the layout stays mounted across /settings and /settings/*).
 *
 * Opening a setting from the Settings home runs the whole animation from the click, in parallel with the page loading,
 * so it never waits on the server: the pane opens (it is always in the layout, collapsed on the home page), the clicked
 * circle flies to that setting's slot in the pane, the grid fades, and the new page fades in when it arrives.
 * Anything else (direct load, pane links, Back) has no launch and no animation.
 */
export function SettingsTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname.replace(/\/$/, "") === "/settings";
  const [launched, setLaunched] = useState<string | null>(null); // from click until the new page commits
  const [settling, setSettling] = useState(false); // short window after commit: page fades in
  const [flight, setFlight] = useState<Flight | null>(null);
  const flyer = useRef<HTMLDivElement>(null);

  // the new page is in: stop hiding the tile, let the page fade in for a moment (state adjusted during render, not in an effect)
  if (launched && !onHome) {
    setLaunched(null);
    setSettling(true);
  }

  const launch = useCallback<Ctx["launch"]>(
    (href, circle, Icon) => {
      // the pane only exists on lg+; respect reduced motion
      if (!window.matchMedia("(min-width: 1024px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      const target = document.querySelector<HTMLElement>(`[data-settings-icon="${href}"]`);
      if (!target) return false;
      const from = circle.getBoundingClientRect();
      // the pane is still collapsed and shifted left by PANE_SLIDE: its slot's final spot is that much to the right
      const to = target.getBoundingClientRect();
      const c = getComputedStyle(circle);
      const t = getComputedStyle(target);
      setFlight({
        href,
        Icon,
        left: from.left,
        top: from.top,
        size: from.width,
        dx: to.left + PANE_SLIDE - from.left,
        dy: to.top - from.top,
        scale: to.width / from.width,
        // start where the hovered tile looks, end where the pane's active icon looks
        bg: [c.backgroundColor, t.backgroundColor],
        fg: [c.color, getComputedStyle(document.body).color],
      });
      setLaunched(href);
      router.push(href);
      return true;
    },
    [router],
  );

  // the flying circle: transform + colour only, runs on the compositor, starts the frame it appears
  useLayoutEffect(() => {
    const el = flyer.current;
    if (!flight || !el) return;
    const anim = el.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", backgroundColor: flight.bg[0], color: flight.fg[0] },
        { transform: `translate(${flight.dx}px, ${flight.dy}px) scale(${flight.scale})`, backgroundColor: flight.bg[1], color: flight.fg[1] },
      ],
      { duration: FLIGHT_MS, easing: PANE_EASE, fill: "forwards" },
    );
    anim.onfinish = () => setFlight(null);
    return () => {
      // detach first: a cancel (StrictMode's effect replay) must not end the flight
      anim.onfinish = null;
      anim.cancel();
    };
  }, [flight]);

  useEffect(() => {
    if (!settling) return;
    const t = window.setTimeout(() => setSettling(false), 900);
    return () => window.clearTimeout(t);
  }, [settling]);
  // navigation never arrived: give the home page back
  useEffect(() => {
    if (!launched || !onHome) return;
    const t = window.setTimeout(() => setLaunched(null), 8000);
    return () => window.clearTimeout(t);
  }, [launched, onHome]);

  const paneOpen = !onHome || launched !== null;
  const paneInstant = onHome && launched === null;
  const value = useMemo<Ctx>(
    () => ({
      launch,
      paneOpen,
      paneInstant,
      paneTransition: paneInstant ? "none" : `width ${PANE_MS}ms ${PANE_EASE}, opacity ${PANE_MS}ms ${PANE_EASE}, transform ${PANE_MS}ms ${PANE_EASE}`,
      flyingHref: flight?.href ?? null,
      launchedHref: launched,
    }),
    [launch, paneOpen, paneInstant, flight, launched],
  );
  const Icon = flight?.Icon;

  return (
    <SettingsTransitionContext.Provider value={value}>
      <div className="flex" data-launching={launched ? "" : undefined} data-launched={launched || settling ? "" : undefined}>
        {children}
      </div>
      {flight && Icon ? (
        <div
          ref={flyer}
          aria-hidden
          className="pointer-events-none fixed z-50 grid place-items-center rounded-full"
          style={{ left: flight.left, top: flight.top, width: flight.size, height: flight.size, transformOrigin: "top left", willChange: "transform" }}
        >
          <Icon size={Math.round(flight.size / 2)} />
        </div>
      ) : null}
    </SettingsTransitionContext.Provider>
  );
}
