import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsTransitionProvider } from "@/components/settings/settings-transition";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <SettingsTransitionProvider>
      <SettingsNav />
      {children}
    </SettingsTransitionProvider>
  );
}
