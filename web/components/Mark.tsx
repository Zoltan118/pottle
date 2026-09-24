import Link from "next/link";

/** the pottle mark: lid bar, round body, marigold money at 70% */
export function Mark() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <defs><clipPath id="mark-inner"><circle cx="48" cy="57" r="23" /></clipPath></defs>
      <rect x="17" y="17" width="62" height="12" rx="6" fill="currentColor" />
      <rect x="20" y="60" width="56" height="30" fill="#F2B32A" clipPath="url(#mark-inner)" />
      <circle cx="48" cy="57" r="27" fill="none" stroke="currentColor" strokeWidth="8" />
    </svg>
  );
}

export function Logo() {
  return <Link className="logo" href="/" aria-label="pottle home">p<Mark />ttle</Link>;
}
