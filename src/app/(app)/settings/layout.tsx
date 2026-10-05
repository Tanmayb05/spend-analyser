import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex gap-6">
      <SettingsNav />
      {children}
    </div>
  );
}
