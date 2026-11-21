import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { PasswordForm, SignOutAll } from "@/components/settings/profile-forms";
import { HELP } from "@/lib/help";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <SettingsPage title="Security" info={HELP.security}>
      <PasswordForm />
      <SignOutAll />
      <Card>
        <CardHeader title="Delete account" subtitle="Wipe your data or delete the account under Reset or delete. It asks for your password." />
        <Link href="/settings/reset" className="text-sm text-accent underline-offset-4 hover:underline">
          Go to Reset or delete
        </Link>
      </Card>
    </SettingsPage>
  );
}
