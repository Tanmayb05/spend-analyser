"use client";

import { useEffect } from "react";
import { SystemState } from "@/components/auth/system-state";
import { Button } from "@/components/ui/button";

/** Inside the app shell: the sidebar stays, only the page is replaced. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemState
      inShell
      title="Something went wrong"
      body={error.digest ? `This page failed to load. Reference ${error.digest}` : "This page failed to load"}
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
