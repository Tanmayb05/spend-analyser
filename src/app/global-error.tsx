"use client";

import { useEffect } from "react";
import { SystemState } from "@/components/auth/system-state";
import { Button } from "@/components/ui/button";
import "./globals.css";

/** Replaces the root layout, so it brings its own html, body and styles. The theme cookie is not read here: it follows the OS. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="system" className="h-full">
      <body className="min-h-full">
        <title>Something went wrong · Spend Analyser</title>
        <SystemState
          title="Something went wrong"
          body={error.digest ? `Spend Analyser failed to load. Reference ${error.digest}` : "Spend Analyser failed to load"}
          action={<Button onClick={() => retry()}>Try again</Button>}
        />
      </body>
    </html>
  );
}
