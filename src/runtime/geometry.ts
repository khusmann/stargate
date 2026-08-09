/** The wall. Two 192 x 12 strips on opposite sides of a corridor, stacked into one
 *  192 x 24 canvas. Rows 0-11 are the Right strip, rows 12-23 the Left. */

export const WIDTH = 192;
export const HEIGHT = 24;
export const BAND_HEIGHT = 12;
export const PIXELS = WIDTH * HEIGHT;

export type Band = "right" | "left";

/** First row of a band in canvas coordinates. */
export function bandTop(band: Band): number {
  return band === "right" ? 0 : BAND_HEIGHT;
}

// --- Antiparallel wiring ---------------------------------------------------
//
// The two ceiling runs are addressed from opposite ends of the corridor (see
// "The runs are antiparallel" in DESIGN.md), so one band's column order is
// reversed relative to the other. Compensating in the exporter is what lets a
// script draw a single physical coordinate space instead of mirroring content
// by hand, the way the old `(rev)` assets did.
//
// OPEN QUESTION: which band is the reversed one is not yet known — it needs the
// spike run at the wall (spike/README.md, patterns "ends" and "walls"). Both
// candidate answers are a single global flip, so guessing costs a re-export and
// buys nothing. Default is identity: export exactly what the preview shows.
export const REVERSED_BAND: Band | null = null;

/**
 * Reverse column order for the antiparallel band, in place, on a 192 x 24 RGBA
 * buffer. A no-op while REVERSED_BAND is null.
 */
export function applyBandReversal(
  data: Uint8ClampedArray,
  band: Band | null = REVERSED_BAND,
): void {
  if (band === null) return;
  const y0 = bandTop(band);
  for (let y = y0; y < y0 + BAND_HEIGHT; y++) {
    const row = y * WIDTH * 4;
    for (let x = 0; x < WIDTH >> 1; x++) {
      const a = row + x * 4;
      const b = row + (WIDTH - 1 - x) * 4;
      for (let k = 0; k < 4; k++) {
        const tmp = data[a + k]!;
        data[a + k] = data[b + k]!;
        data[b + k] = tmp;
      }
    }
  }
}
