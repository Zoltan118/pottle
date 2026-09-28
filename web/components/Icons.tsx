/**
 * pottle's icons: lucide shapes, animated only as feedback. each one moves when the button around it
 * is hovered, pressed or focused (see the `.ico` rules in globals.css), never on its own, so the pot
 * stays the one thing on the page that moves. reduced motion turns every animation off.
 */

type P = { className?: string };
const base = (name: string, className?: string) => `ico ico-${name}${className ? ` ${className}` : ""}`;
const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** share: the arrow lifts out of the tray */
export const ShareIcon = ({ className }: P) => (
  <svg {...svg} className={base("share", className)}>
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <g className="ico-lift"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /></g>
  </svg>
);

/** copy, which draws a tick once `done` is true */
export const CopyIcon = ({ done, className }: P & { done?: boolean }) => done ? (
  <svg {...svg} className={base("check", className)}><path className="ico-draw" d="M20 6 9 17l-5-5" /></svg>
) : (
  <svg {...svg} className={base("copy", className)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path className="ico-back" d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

/** a link that leaves the page: the arrow nudges up and out */
export const ArrowOutIcon = ({ className }: P) => (
  <svg {...svg} className={base("out", className)}><g className="ico-nudge"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></g></svg>
);

/** close: a quarter turn */
export const CloseIcon = ({ className }: P) => (
  <svg {...svg} className={base("close", className)}><g className="ico-turn"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></g></svg>
);

/** back: slides the way it points */
export const BackIcon = ({ className }: P) => (
  <svg {...svg} className={base("back", className)}><g className="ico-slide"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></g></svg>
);
