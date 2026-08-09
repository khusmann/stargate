// The Stargate show API. A show is one self-contained .js file.
// The canvas is 192 x 24: two 192 x 12 strips on opposite walls of a corridor.
// Rows 0-11 are one wall, rows 12-23 the other. Nobody ever sees a shape
// spanning all 24 rows as one image.

/** The show's title, used as the export filename. Optional — defaults to "Untitled". */
export const name: string;

/** Frames per second. 30 unless you have a reason. */
export const fps: number;

/** Length of the show. Frame count is `fps * seconds`. */
export const seconds: number;

/**
 * The shader. Called for every pixel of every frame: x is 0-191, y is 0-23,
 * t is seconds elapsed. Return a packed 24-bit colour — `rgb()`, `hsl()`, or a
 * bare 0xRRGGBB. Must not allocate: it runs ~4 million times per bake.
 */
export function pixel(x: number, y: number, t: number): number;

/**
 * Imperative drawing on a real 192 x 24 canvas, for hard edges a shader is
 * clumsy at. Runs after `pixel` and composites on top of it. Anything
 * continuous belongs in `pixel` instead.
 */
export function draw(ctx: ShowContext, t: number): void;

/** Pack a colour from components 0-255. */
declare function rgb(r: number, g: number, b: number): number;

/** Pack a colour from hue 0-360 (wraps) and saturation/lightness 0-1. */
declare function hsl(h: number, s: number, l: number): number;

/** A CanvasRenderingContext2D, plus two helpers for the two-wall geometry. */
interface ShowContext extends CanvasRenderingContext2D {
  /** Clip drawing to one strip; `band(null)` clears the clip. */
  band(band: "right" | "left" | null): void;

  /** Duplicate one strip onto the other. A straight copy, never a mirror. */
  copy(direction?: "right→left" | "left→right"): void;

  /** Colour or gradient for `fillRect`. Any CSS colour string. */
  fillStyle: string | CanvasGradient | CanvasPattern;

  /** Opacity 0-1 applied to everything drawn after it. */
  globalAlpha: number;

  /** Fill a rectangle in canvas pixels. */
  fillRect(x: number, y: number, w: number, h: number): void;

  /** Erase a rectangle back to black. */
  clearRect(x: number, y: number, w: number, h: number): void;
}
