export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 47V17" className="stroke-blue-500" />
      <path d="M17 17l15 17 15-17v30" stroke="currentColor" />
    </svg>
  );
}
