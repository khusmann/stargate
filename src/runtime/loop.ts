/** Does the show close?
 *
 *  The wall replays the same `seconds` for hours, so the frame after the last
 *  one is frame 0 — and a show whose motion is not exactly periodic jumps every
 *  time round. It is the most common flaw in a generated show and the easiest
 *  to miss on screen, because you have to be watching the moment it wraps.
 *
 *  This matters most for shows that arrive by paste. An assistant writing one
 *  runs somewhere else entirely: it never sees this app, never runs the show,
 *  and gets no feedback except what a person copies back to it. So the check
 *  has to happen here, and `describeSeam` is written to be pasted into that
 *  reply verbatim.
 */

import { HEIGHT, WIDTH } from "./geometry";
import { FrameRenderer } from "./render";
import type { Show } from "./compile";

export interface LoopSeam {
  x: number;
  y: number;
  /** Largest channel difference, 0-255. */
  delta: number;
}

/** Below this, blame floating point rather than the author: sin(2πk) is not
 *  exactly zero, and a channel or two out of 255 is not visible. */
const TOLERANCE = 2;

/**
 * Render the first frame and the frame one full show-length later, and return
 * where they differ — or null when the show closes cleanly.
 */
export function findLoopSeam(show: Show, renderer?: FrameRenderer): LoopSeam | null {
  const target = renderer ?? new FrameRenderer();

  target.render(show, 0);
  const first = Uint8ClampedArray.from(target.readPixels().data);
  target.render(show, show.frames / show.fps);
  const wrapped = target.readPixels().data;

  let worst = 0;
  let at = -1;
  for (let i = 0; i < first.length; i++) {
    const delta = Math.abs((first[i] ?? 0) - (wrapped[i] ?? 0));
    if (delta > worst) {
      worst = delta;
      at = i;
    }
  }

  if (worst <= TOLERANCE || at < 0) return null;
  const pixel = Math.floor(at / 4);
  return { x: pixel % WIDTH, y: Math.floor(pixel / WIDTH) % HEIGHT, delta: worst };
}

/** A description an author can hand straight back to whatever wrote the show. */
export function describeSeam(show: Show, seam: LoopSeam): string {
  return (
    `This show does not loop seamlessly. At t = ${show.seconds}s the frame ` +
    `differs from the frame at t = 0 — pixel (${seam.x}, ${seam.y}) is off by ` +
    `${seam.delta} of 255 — so the wall will jump every time it wraps. ` +
    `Please make every time-varying term complete a whole number of cycles in ` +
    `\`seconds\`: derive angular frequencies as \`Math.PI * 2 / seconds\` times ` +
    `an integer, and pick speeds so a repeating pattern covers a whole number ` +
    `of repeats per show.`
  );
}
