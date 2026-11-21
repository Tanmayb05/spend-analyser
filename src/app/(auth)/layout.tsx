import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-compact py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={32} />
          <span className="text-lg font-medium">Spend Analyser</span>
        </div>
        <div className="rounded-card border border-border bg-surface p-card-lg sm:p-page-lg">{children}</div>
      </div>
    </main>
  );
}
