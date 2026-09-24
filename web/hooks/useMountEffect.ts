import { useEffect, type EffectCallback } from "react";

/** run once after mount. the one sanctioned wrapper around useEffect in this app */
// eslint-disable-next-line react-hooks/exhaustive-deps
export const useMountEffect = (fn: EffectCallback) => useEffect(fn, []);
