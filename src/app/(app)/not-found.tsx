import { HomeLink, SystemState } from "@/components/auth/system-state";

export default function NotFound() {
  return <SystemState inShell title="Not found" body="That item doesn't exist or was deleted" action={<HomeLink />} />;
}
