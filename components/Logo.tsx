/* ShiftBoard's logo: a rota card with three shifts on it, and an amber pin */
export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" fill="#2453a6" />
      <rect x="8" y="10" width="11" height="3.2" rx="1.6" fill="#fff" />
      <rect x="12" y="15" width="12" height="3.2" rx="1.6" fill="#fff" opacity=".85" />
      <rect x="8" y="20" width="9" height="3.2" rx="1.6" fill="#fff" opacity=".7" />
      <circle cx="23.5" cy="8.5" r="3" fill="#f5b867" />
    </svg>
  );
}
