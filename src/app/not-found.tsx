import type { Metadata } from "next";
import { HomeLink, SystemState } from "@/components/auth/system-state";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <SystemState title="Page not found" body="This address doesn't match anything in Spend Analyser" action={<HomeLink />} />;
}
