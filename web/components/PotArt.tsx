import { useId } from "react";

/** the pot at any fill level, 0 to 1. the fill slides up, so changing level animates */
export function PotArt({ level }: { level: number }) {
  const clip = useId();
  const l = Math.max(0, Math.min(1, level));
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="48" cy="57" r="23" /></clipPath></defs>
      <rect x="17" y="17" width="62" height="12" rx="6" fill="currentColor" />
      <g clipPath={`url(#${clip})`}>
        <rect className="fill" x="20" y="34" width="56" height="50" fill="#F2B32A" style={{ transform: `translateY(${(1 - l) * 46}px)` }} />
      </g>
      <circle cx="48" cy="57" r="27" fill="none" stroke="currentColor" strokeWidth="8" />
    </svg>
  );
}
