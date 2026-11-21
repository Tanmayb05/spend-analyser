/** Inside the app shell: plain text in the content area, shown only if the page takes more than a moment (keyframe is in globals.css). */
export default function Loading() {
  return (
    <div role="status" className="py-page text-sm text-muted animate-[settings-page-in_var(--dur-slow)_300ms_var(--ease-ui)_both]">
      Loading
    </div>
  );
}
