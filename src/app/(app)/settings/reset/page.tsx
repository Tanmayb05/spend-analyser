import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { DangerZone } from "@/components/settings/danger-zone";
import { HELP } from "@/lib/help";

export const metadata = { title: "Reset or delete" };

export default function ResetPage() {
  return (
    <SettingsPage title="Reset or delete" info={HELP.reset} description="Start over or close your account.">
      <Card className="border-bad/30">
        <CardHeader
          title="Choose what to remove"
          subtitle="None of these can be undone, and each one asks for your current password."
        />
        <p className="mb-4 text-sm text-muted">
          Back up first:{" "}
          <Link href="/settings/data" className="text-accent underline-offset-4 hover:underline">
            export your data
          </Link>
          .
        </p>
        <DangerZone />
      </Card>
    </SettingsPage>
  );
}
