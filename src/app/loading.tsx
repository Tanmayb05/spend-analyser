/** Root loading state: plain text that only appears if the page takes more than a moment (keyframe is in globals.css). */
export default function Loading() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center text-sm text-muted animate-[settings-page-in_var(--dur-slow)_300ms_var(--ease-ui)_both]">
      Loading
    </div>
  );
}
