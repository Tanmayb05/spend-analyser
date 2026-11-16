import { SettingsGrid } from "@/components/settings/settings-grid";

export const metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="text-2xl font-medium">Settings</h1>
      <p className="mt-1 text-sm text-muted">Pick something to set up or change.</p>
      <SettingsGrid />
    </div>
  );
}
