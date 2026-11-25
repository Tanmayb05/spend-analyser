import { SettingsPage } from "@/components/settings/section";
import { ShortcutsEditor } from "@/components/settings/shortcuts-editor";
import { HELP } from "@/lib/help";

export const metadata = { title: "Keyboard shortcuts" };

export default function ShortcutsPage() {
  return (
    <SettingsPage title="Keyboard shortcuts" description="Every shortcut in the app. Press ? anywhere to see this list" info={HELP.shortcuts}>
      <ShortcutsEditor />
    </SettingsPage>
  );
}
