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

/** history: a clock with its hand turning back */
export const HistoryIcon = ({ className }: P) => (
  <svg {...svg} className={base("history", className)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
);

/** back to top: the arrow lifts */
export const UpIcon = ({ className }: P) => (
  <svg {...svg} className={base("up", className)}><g className="ico-lift"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></g></svg>
);

/** close: a quarter turn */
export const CloseIcon = ({ className }: P) => (
  <svg {...svg} className={base("close", className)}><g className="ico-turn"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></g></svg>
);

/** back: slides the way it points */
export const BackIcon = ({ className }: P) => (
  <svg {...svg} className={base("back", className)}><g className="ico-slide"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></g></svg>
);

/** add money: the plus turns a little */
export const PlusIcon = ({ className }: P) => (
  <svg {...svg} className={base("plus", className)}><g className="ico-turn"><path d="M12 5v14" /><path d="M5 12h14" /></g></svg>
);

/** receive: the arrow comes in and down */
export const InIcon = ({ className }: P) => (
  <svg {...svg} className={base("in", className)}><g className="ico-nudge-in"><path d="M17 7 7 17" /><path d="M17 17H7V7" /></g></svg>
);

/** the face id lock */
export const LockIcon = ({ className }: P) => (
  <svg {...svg} className={base("lock", className)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

/** add to home screen */
export const PhoneIcon = ({ className }: P) => (
  <svg {...svg} className={base("phone", className)}><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>
);

/** a row that opens more: the chevron slides the way it points */
export const NextIcon = ({ className }: P) => (
  <svg {...svg} className={base("next", className)}><g className="ico-slide-r"><path d="m9 6 6 6-6 6" /></g></svg>
);

/** sign out: the arrow leaves the door */
export const ExitIcon = ({ className }: P) => (
  <svg {...svg} className={base("exit", className)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><g className="ico-slide-r"><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></g></svg>
);
