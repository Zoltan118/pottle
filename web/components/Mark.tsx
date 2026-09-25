import Link from "next/link";

/** the pottle mark: lid bar, round body, marigold money at 70% */
function Mark({ clip = "mark-inner" }: { clip?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="48" cy="57" r="23" /></clipPath></defs>
      <rect x="17" y="17" width="62" height="12" rx="6" fill="currentColor" />
      <rect x="20" y="60" width="56" height="30" fill="#F2B32A" clipPath={`url(#${clip})`} />
      <circle cx="48" cy="57" r="27" fill="none" stroke="currentColor" strokeWidth="8" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link className="logo" href="/" aria-label="pottle home">p<Mark />ttle</Link>
  );
}

/** the wordmark as a huge, quiet sign-off at the very bottom of the page, cropped by the edge */
export function BigMark() {
  return (
    <div className="bigmark" aria-hidden="true">
      <span>p<Mark clip="bigmark-inner" />ttle</span>
    </div>
  );
}
