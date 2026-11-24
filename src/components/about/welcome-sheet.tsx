"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DemoVideo, DEMO_VIDEO } from "./demo-video";

/**
 * Shown once, right after sign-up (the confirm link and the instant-session sign-up land on `/?welcome=1`).
 * Closing drops the query param so a refresh doesn't bring it back. The tour stays in Settings → About.
 */
export function WelcomeSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    router.replace(pathname, { scroll: false });
  };

  return (
    <Sheet open={open} onClose={close} title="Welcome to Spend Analyser" className="sm:max-w-2xl">
      <p className="text-sm text-muted">
        A {DEMO_VIDEO.seconds}-second tour of what the app does. You can watch it again any time in Settings → About.
      </p>
      <DemoVideo className="mt-4" />
      <div className="mt-card flex flex-col-reverse gap-2 pb-card sm:flex-row sm:justify-end">
        <Link
          href="/settings/data"
          onClick={() => setOpen(false)}
          className="inline-flex h-11 items-center justify-center rounded-control border border-border bg-surface-2 px-4 text-sm font-medium transition-colors hover:bg-surface-3"
        >
          Import my spreadsheet
        </Link>
        <Button onClick={close}>Get started</Button>
      </div>
    </Sheet>
  );
}
