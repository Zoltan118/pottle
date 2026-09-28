"use client";

import { useId, useRef } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

export type Mood = "idle" | "look" | "happy" | "stars" | "waiting" | "worried" | "calm" | "confused" | "hold" | "wince";
export type MascotStyle = "a" | "b" | "c";

const INK = "currentColor";
const GOLD = "#F2B32A";
const GOLD_DEEP = "#E0A01A";

/** the eyes for each mood, drawn around (0, 0) so the same shapes work wherever the eyes sit */
function Eye({ mood, fill, side, tiny }: { mood: Mood; fill: string; side: -1 | 1; tiny: boolean }) {
  switch (mood) {
    case "happy": return <path d="M-3.4 1.4 Q0 -3.4 3.4 1.4" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />;
    case "calm": return <path d="M-3.2 -0.6 Q0 2.8 3.2 -0.6" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />;
    case "stars": return <path d="M0 -4.2 1.3 -1.3 4.2 0 1.3 1.3 0 4.2 -1.3 1.3 -4.2 0 -1.3 -1.3Z" fill={fill} />;
    case "worried": return <g><circle r="2.4" fill={fill} /><path d={side < 0 ? "M-3.6 -4.2 2.4 -6.2" : "M-2.4 -6.2 3.6 -4.2"} stroke={fill} strokeWidth="1.8" strokeLinecap="round" /></g>;
    case "confused": return <circle r={side < 0 ? 3.6 : 2.2} fill={fill} />;
    // paying: eyes wide open, holding its breath
    case "hold": return <g><circle r="4" fill={fill} />{!tiny && <circle cx="1.3" cy="-1.4" r="1.2" fill="#FFFFFF" fillOpacity=".9" />}</g>;
    // something went wrong: eyes squeezed shut, > <
    case "wince": return <path d={side < 0 ? "M-3 -2.6 2 0 -3 2.6" : "M3 -2.6 -2 0 3 2.6"} fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
    default: return <g><circle r="3.2" fill={fill} />{!tiny && <circle cx="1" cy="-1.1" r=".9" fill="#FFFFFF" fillOpacity=".85" />}</g>;
  }
}

// moods where the eyes are open and free to look around
const LOOKING: Mood[] = ["idle", "look", "waiting", "hold", "worried"];
// moods that blink now and then
const BLINKING: Mood[] = ["idle", "look", "waiting", "worried", "confused"];

/**
 * pottle's mascot: the pot mark, alive. the gold inside is liquid: it ripples, sloshes when the pot
 * moves and splashes when a coin lands. the body squashes and stretches, the lid lags a beat like a
 * loose hat, the eyes follow your finger or pointer on a spring, and it blinks at random. every
 * movement is transform-only, and reduced motion keeps the faces but stops all of it
 */
export function Mascot({ style = "c", mood, level = 0.42, size, track = false }: {
  style?: MascotStyle;
  mood: Mood;
  level?: number;
  size?: number;
  track?: boolean; // eyes follow the pointer, a tap, or the field being typed in
}) {
  const clip = useId();
  const svg = useRef<SVGSVGElement>(null);
  const gaze = useRef<SVGGElement>(null);
  const l = Math.max(0, Math.min(1, level));
  const onLid = style === "b";
  const eyeFill = onLid ? "var(--paper)" : mood === "stars" ? "#231A33" : INK;
  const eyeY = onLid ? 23 : 49;
  const feet = style === "c";
  const tiny = !!size && size < 44; // at icon sizes the highlights and blush turn to mush, so they go

  useMountEffect(() => {
    const el = svg.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    let alive = true;
    const current = () => (el.getAttribute("data-mood") ?? "idle") as Mood;

    // blinking at random, now and then a double blink, the way people do
    const blinkOnce = () => { el.classList.add("masc-blinking"); timers.push(window.setTimeout(() => el.classList.remove("masc-blinking"), 130)); };
    const scheduleBlink = () => {
      timers.push(window.setTimeout(() => {
        if (!alive) return;
        if (BLINKING.includes(current())) {
          blinkOnce();
          if (Math.random() < 0.18) timers.push(window.setTimeout(blinkOnce, 260));
        }
        scheduleBlink();
      }, 2200 + Math.random() * 3800));
    };
    scheduleBlink();

    // the gaze: a spring that eases the eyes toward a target, so they glide with a little momentum
    let frame = 0, x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0;
    const MAX = 2.8, K = 0.09, DAMP = 0.72;
    const step = () => {
      const free = LOOKING.includes(current());
      const gx = free ? tx : 0, gy = free ? ty : 0;
      vx = (vx + (gx - x) * K) * DAMP; vy = (vy + (gy - y) * K) * DAMP;
      x += vx; y += vy;
      gaze.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      frame = Math.abs(vx) + Math.abs(vy) + Math.abs(gx - x) + Math.abs(gy - y) > 0.01 ? requestAnimationFrame(step) : 0;
    };
    const aim = (px: number, py: number) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
      const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, d / 220); // near the pot the eyes move less, far away they reach the edge
      tx = (dx / d) * MAX * pull; ty = (dy / d) * MAX * pull * 0.8;
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onMove = (e: PointerEvent) => aim(e.clientX, e.clientY);
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t?.matches?.("input, button")) { const r = t.getBoundingClientRect(); aim(r.left + r.width / 2, r.top + r.height / 2); }
    };
    if (track) {
      addEventListener("pointermove", onMove, { passive: true });
      addEventListener("pointerdown", onMove, { passive: true });
      addEventListener("focusin", onFocus);
    }
    return () => {
      alive = false; timers.forEach(clearTimeout); cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove); removeEventListener("pointerdown", onMove); removeEventListener("focusin", onFocus);
    };
  });

  return (
    // without a size it fills its box (the pot's square stage) and keeps its proportions
    <svg ref={svg} data-mood={mood} className={`masc masc-${mood}`} width={size} height={size ? size * (feet ? 108 / 96 : 1) : undefined} viewBox={`0 0 96 ${feet ? 108 : 96}`} aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="48" cy="57" r="23" /></clipPath></defs>
      <g className="masc-body">
        {feet && <g className="masc-feet"><rect x="31" y="86" width="12" height="10" rx="5" fill={INK} /><rect x="53" y="86" width="12" height="10" rx="5" fill={INK} /></g>}
        {/* the liquid: its level slides up and down, its surface ripples and sloshes */}
        <g clipPath={`url(#${clip})`}>
          <g className="fill" style={{ transform: `translateY(${(1 - l) * 46}px)` }}>
            <g className="masc-liquid">
              <rect x="10" y="37" width="76" height="52" fill={GOLD} />
              <g className="masc-surface">
                <path className="masc-wave" d="M-8 37 Q-1 34 6 37 T20 37 T34 37 T48 37 T62 37 T76 37 T90 37 T104 37 T118 37 V42 H-8 Z" fill={GOLD} />
                <path className="masc-wave masc-wave-back" d="M-8 36 Q-1 38.5 6 36 T20 36 T34 36 T48 36 T62 36 T76 36 T90 36 T104 36 T118 36 V40 H-8 Z" fill={GOLD_DEEP} fillOpacity=".55" />
              </g>
            </g>
          </g>
        </g>
        <circle cx="48" cy="57" r="27" fill="none" stroke={INK} strokeWidth="8" />
        {feet && !tiny && <g className="masc-blush"><ellipse cx="33" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" /><ellipse cx="63" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" /></g>}
        <g ref={gaze}>
          <g className="masc-eyes">
            <g transform={`translate(40 ${eyeY})`}><g className="masc-eye"><Eye mood={mood} fill={eyeFill} side={-1} tiny={tiny} /></g></g>
            <g transform={`translate(56 ${eyeY})`}><g className="masc-eye"><Eye mood={mood} fill={eyeFill} side={1} tiny={tiny} /></g></g>
          </g>
        </g>
        {/* the lid sits loose, like a hat: it lags a beat behind every hop */}
        <g className="masc-lid"><rect x="17" y="17" width="62" height="12" rx="6" fill={INK} /></g>
        {mood === "confused" && <text className="masc-q" x="80" y="16" fontSize="16" fontWeight="800" fill={INK} fontFamily="var(--display)">?</text>}
      </g>
    </svg>
  );
}
