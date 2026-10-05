import { Card, CardHeader } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { PasswordForm, SignOutAll } from "@/components/settings/profile-forms";
import { TypeToConfirm } from "@/components/settings/danger-delete";
import { deleteAccount } from "../actions";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <SettingsPage title="Security">
      <PasswordForm />
      <SignOutAll />
      <Card className="border-bad/30">
        <CardHeader
          title="Delete account"
          subtitle="Permanently deletes your account, every transaction, budget, receipt file and setting. This can't be undone. Export a backup first (Import & export)."
        />
        <TypeToConfirm label="Delete my account" action={deleteAccount} />
      </Card>
    </SettingsPage>
  );
}
