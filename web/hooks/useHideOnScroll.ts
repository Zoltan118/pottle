import { type RefObject } from "react";
import { useMountEffect } from "./useMountEffect";

/*
 * the top bar stays at hand without taking the screen: it slides away while you scroll down and comes
 * back the moment you scroll up, the way safari's own bar does. it writes two data attributes on the
 * element (no react state, so scrolling never re-renders the page): data-scrolled once the page has
 * moved past the bar, data-hide while it's tucked away
 */
export function useHideOnScroll(ref: RefObject<HTMLElement | null>) {
  useMountEffect(() => {
    // straight from the scroll event, not a frame callback: frame callbacks stop in a background tab
    let last = window.scrollY;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const y = Math.max(0, window.scrollY), h = el.offsetHeight, d = y - last;
      el.toggleAttribute("data-scrolled", y > 4);
      if (y <= h) el.removeAttribute("data-hide"); // near the top it's always there
      else if (d > 6) el.setAttribute("data-hide", ""); // a real scroll down, not a jitter
      else if (d < -6) el.removeAttribute("data-hide"); // any real scroll up brings it back
      if (Math.abs(d) > 6 || y <= h) last = y;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  });
}
