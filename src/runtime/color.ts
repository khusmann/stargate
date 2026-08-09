/** Colour helpers exposed to show code as globals.
 *
 *  Everything is a packed 24-bit integer (0xRRGGBB). `pixel` is called 4,608
 *  times a frame — ~4.1M times per 30 s bake — so nothing here may allocate.
 */

function byte(v: number): number {
  // | 0 truncates and also turns NaN into 0.
  const n = v | 0;
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function unit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v || 0;
}

/** rgb(255, 128, 0) — components 0-255, clamped. */
export function rgb(r: number, g: number, b: number): number {
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** hsl(200, 0.9, 0.5) — hue in degrees (wraps), saturation and lightness 0-1. */
export function hsl(h: number, s: number, l: number): number {
  const sat = unit(s);
  const lit = unit(l);
  if (sat === 0) {
    const v = byte(lit * 255 + 0.5);
    return (v << 16) | (v << 8) | v;
  }
  let hue = h % 360;
  if (hue < 0) hue += 360;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lit - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    (byte((r + m) * 255 + 0.5) << 16) |
    (byte((g + m) * 255 + 0.5) << 8) |
    byte((b + m) * 255 + 0.5)
  );
}
