"use client";

import type { ReactNode } from "react";

/** bottom sheet. the scrim closes it, escape is handled by the owner */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={label} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        {children}
      </div>
    </>
  );
}
