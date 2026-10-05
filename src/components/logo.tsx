export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="128" fill="var(--surface-3)" />
      <rect x="120" y="260" width="64" height="132" rx="20" fill="var(--faint)" />
      <rect x="224" y="180" width="64" height="212" rx="20" fill="var(--accent)" />
      <rect x="328" y="120" width="64" height="272" rx="20" fill="var(--faint)" />
    </svg>
  );
}
