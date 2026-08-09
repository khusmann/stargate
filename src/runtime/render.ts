/** Renders one show frame into a 192 x 24 canvas.
 *
 *  Shared by the preview and the exporter — the same code path renders both, so
 *  what you watch is what you ship. The only difference is where `t` comes from.
 */

import { HEIGHT, WIDTH } from "./geometry";
import { makeShowContext, resetContext, type ShowContext } from "./context";
import { toShowError } from "./errors";
import type { Show } from "./compile";

export function createFrameCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

export class FrameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: ShowContext;
  /** Allocated once and reused for every frame, forever. */
  private readonly image: ImageData;

  constructor(canvas: HTMLCanvasElement = createFrameCanvas()) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not get a 2D context — canvas is unavailable.");
    this.canvas = canvas;
    this.ctx = makeShowContext(ctx);
    this.image = ctx.createImageData(WIDTH, HEIGHT);
    const data = this.image.data;
    for (let i = 3; i < data.length; i += 4) data[i] = 255; // opaque, always
  }

  /** Render the show at time `t` (seconds). Throws ShowError on the first
   *  failure — `pixel` runs 4,608 times a frame, and one throw must produce one
   *  error, not 4,608. */
  render(show: Show, t: number): void {
    const { ctx } = this;
    resetContext(ctx);

    const { pixel } = show;
    if (pixel) {
      const data = this.image.data;
      let i = 0;
      try {
        for (let y = 0; y < HEIGHT; y++) {
          for (let x = 0; x < WIDTH; x++) {
            const c = pixel(x, y, t) | 0;
            data[i] = (c >> 16) & 255;
            data[i + 1] = (c >> 8) & 255;
            data[i + 2] = c & 255;
            i += 4;
          }
        }
      } catch (err) {
        throw toShowError(err, "render");
      }
      ctx.putImageData(this.image, 0, 0);
    } else {
      // No shader, so start from black rather than from the previous frame:
      // scrubbing backwards has to give the same picture as playing forwards.
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    if (show.draw) {
      try {
        show.draw(ctx, t);
      } catch (err) {
        throw toShowError(err, "render");
      } finally {
        ctx.band(null); // drop any clip the show left behind
      }
    }
  }

  /** The finished frame as RGBA bytes. Only the exporter needs this. */
  readPixels(): ImageData {
    return this.ctx.getImageData(0, 0, WIDTH, HEIGHT);
  }
}
