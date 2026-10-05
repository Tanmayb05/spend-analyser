import { SettingsPage } from "@/components/settings/section";
import { ProfileForms } from "@/components/settings/profile-forms";
import { getReferenceData } from "@/lib/data/reference";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ref = await getReferenceData();
  return (
    <SettingsPage title="Profile">
      <ProfileForms name={ref.profile.display_name ?? ""} email={ref.email} />
    </SettingsPage>
  );
}
