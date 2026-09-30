"use client";

/**
 * phones: how much of the screen the keyboard covers. an iphone keyboard does not shrink the page, it
 * only shrinks the visible part (the visual viewport), so anything pinned to the bottom sits behind it.
 * this writes the covered height to `--kb` and the visible height to `--vvh` on `el`, and adds the `kb`
 * class while a real keyboard is up (not a toolbar sliding in). returns the cleanup
 */
export function watchKeyboard(el: HTMLElement | null) {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (!vv || !el) return () => {};
  const fit = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    el.style.setProperty("--kb", `${kb}px`);
    el.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    el.classList.toggle("kb", kb > 80);
  };
  fit();
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
}
