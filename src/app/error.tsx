"use client";

import { useEffect } from "react";
import { SystemState } from "@/components/auth/system-state";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemState
      title="Something went wrong"
      body={error.digest ? `This page failed to load. Reference ${error.digest}` : "This page failed to load"}
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
