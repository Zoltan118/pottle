// the contract limits text by bytes (utf-8), not characters: "ö" is 2 bytes, an emoji is 4.
// these keep what people type inside those limits, so a name never fails on chain.
export const MAX_TITLE_BYTES = 64;
export const MAX_NAME_BYTES = 24;

const enc = new TextEncoder();
export const byteLength = (s: string) => enc.encode(s).length;

/** cut a string to fit `max` utf-8 bytes without splitting a character */
export function fitBytes(s: string, max: number): string {
  if (byteLength(s) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (byteLength(out + ch) > max) break;
    out += ch;
  }
  return out;
}
