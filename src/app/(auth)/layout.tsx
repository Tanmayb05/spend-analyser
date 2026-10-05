import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <span className="text-xl font-medium">Spend Analyser</span>
        </div>
        <div className="rounded-[28px] border border-border bg-surface p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
