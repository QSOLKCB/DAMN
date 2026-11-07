export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a + (b - a)*t;
export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Stable per-cell hash for picking texture variants.
export const hash2 = (x, y) => { let h = Math.imul(x*374761393 + y*668265263, 1274126177); h ^= h >>> 13; return (Math.imul(h, 1103515245) >>> 0); };
