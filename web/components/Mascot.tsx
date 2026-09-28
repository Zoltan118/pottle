"use client";

import { useId } from "react";

export type Mood = "idle" | "look" | "happy" | "stars" | "waiting" | "worried" | "calm" | "confused";
export type MascotStyle = "a" | "b" | "c";

const INK = "currentColor";
const GOLD = "#F2B32A";

/** the eyes for each mood, drawn around (0, 0) so the same shapes work wherever the eyes sit */
function Eye({ mood, fill, side }: { mood: Mood; fill: string; side: -1 | 1 }) {
  switch (mood) {
    case "happy": return <path d="M-3.4 1.4 Q0 -3.4 3.4 1.4" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />;
    case "calm": return <path d="M-3.2 -0.6 Q0 2.8 3.2 -0.6" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />;
    case "stars": return <path d="M0 -4.2 1.3 -1.3 4.2 0 1.3 1.3 0 4.2 -1.3 1.3 -4.2 0 -1.3 -1.3Z" fill={fill} />;
    case "worried": return <g><circle r="2.4" fill={fill} /><path d={side < 0 ? "M-3.6 -4.2 2.4 -6.2" : "M-2.4 -6.2 3.6 -4.2"} stroke={fill} strokeWidth="1.8" strokeLinecap="round" /></g>;
    case "confused": return <circle r={side < 0 ? 3.6 : 2.2} fill={fill} />;
    default: return <g><circle r="3.2" fill={fill} /><circle cx="1" cy="-1.1" r=".9" fill="#FFFFFF" fillOpacity=".85" /></g>;
  }
}

/**
 * pottle's mascot: the pot mark, alive. three candidate styles for now (a: eyes in the pot, b: eyes on
 * the lid, c: eyes, blush and feet), eight moods. every movement is css on a <g>, transform and
 * opacity only, and reduced motion keeps the face but drops the movement
 */
export function Mascot({ style = "c", mood, level = 0.42, size }: { style?: MascotStyle; mood: Mood; level?: number; size?: number }) {
  const clip = useId();
  const l = Math.max(0, Math.min(1, level));
  const onLid = style === "b";
  // eyes on a full, gold pot stay dark ink in both themes, or they vanish into the gold in dark mode
  const eyeFill = onLid ? "var(--paper)" : mood === "stars" ? "#231A33" : INK;
  const eyeY = onLid ? 23 : 49;
  const feet = style === "c";
  return (
    // without a size it fills its box (the pot's square stage) and keeps its proportions
    <svg className={`masc masc-${mood}`} width={size} height={size ? size * (feet ? 108 / 96 : 1) : undefined} viewBox={`0 0 96 ${feet ? 108 : 96}`} aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="48" cy="57" r="23" /></clipPath></defs>
      <g className="masc-body">
        {feet && <g className="masc-feet"><rect x="31" y="86" width="12" height="10" rx="5" fill={INK} /><rect x="53" y="86" width="12" height="10" rx="5" fill={INK} /></g>}
        <g className="masc-lid"><rect x="17" y="17" width="62" height="12" rx="6" fill={INK} /></g>
        {/* the gold slides up to the level, so a new amount fills the pot smoothly */}
        <g clipPath={`url(#${clip})`}><rect className="fill" x="20" y="34" width="56" height="50" fill={GOLD} style={{ transform: `translateY(${(1 - l) * 46}px)` }} /></g>
        <circle cx="48" cy="57" r="27" fill="none" stroke={INK} strokeWidth="8" />
        {feet && <g className="masc-blush"><ellipse cx="33" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" /><ellipse cx="63" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" /></g>}
        <g className="masc-eyes">
          <g transform={`translate(40 ${eyeY})`}><g className="masc-eye"><Eye mood={mood} fill={eyeFill} side={-1} /></g></g>
          <g transform={`translate(56 ${eyeY})`}><g className="masc-eye"><Eye mood={mood} fill={eyeFill} side={1} /></g></g>
        </g>
        {mood === "confused" && <text className="masc-q" x="80" y="16" fontSize="16" fontWeight="800" fill={INK} fontFamily="var(--display)">?</text>}
      </g>
    </svg>
  );
}
