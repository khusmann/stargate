/** The `ctx` handed to `draw`: a real 192 x 24 CanvasRenderingContext2D with two
 *  extras for the fact that the canvas is two walls rather than one picture. */

import { BAND_HEIGHT, HEIGHT, WIDTH, bandTop, type Band } from "./geometry";

export type CopyDirection = "right→left" | "left→right" | "right->left" | "left->right";

export interface ShowContext extends CanvasRenderingContext2D {
  /** Clip subsequent drawing to one strip. `band(null)` clears the clip. */
  band(band: Band | null): void;
  /** Duplicate one strip onto the other. A straight copy, never a mirror —
   *  the exporter owns the antiparallel reversal. */
  copy(direction?: CopyDirection): void;
}

/** Whether `band()` currently holds a save() that has to be popped. Kept outside
 *  the context so `resetContext` can clear it when it clears the state stack. */
const clipState = new WeakMap<CanvasRenderingContext2D, { clipped: boolean }>();

/** Extend a context in place. Called once per canvas, not per frame. */
export function makeShowContext(ctx: CanvasRenderingContext2D): ShowContext {
  const self = ctx as ShowContext;
  const state = { clipped: false };
  clipState.set(ctx, state);

  self.band = (band: Band | null): void => {
    if (state.clipped) {
      ctx.restore();
      state.clipped = false;
    }
    if (band === null) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop(band), WIDTH, BAND_HEIGHT);
    ctx.clip();
    state.clipped = true;
  };

  self.copy = (direction: CopyDirection = "right→left"): void => {
    const toLeft = direction.startsWith("right");
    const from = toLeft ? 0 : BAND_HEIGHT;
    const to = toLeft ? BAND_HEIGHT : 0;
    ctx.drawImage(ctx.canvas, 0, from, WIDTH, BAND_HEIGHT, 0, to, WIDTH, BAND_HEIGHT);
  };

  return self;
}

/** Put the context back to a known state. Every frame starts from here, so a
 *  show that leaves a transform, an alpha, or an unbalanced `save()` behind
 *  cannot corrupt the next frame — or the exported sequence. */
export function resetContext(ctx: CanvasRenderingContext2D): void {
  const state = clipState.get(ctx);
  if (state) state.clipped = false;

  const withReset = ctx as CanvasRenderingContext2D & { reset?: () => void };
  if (typeof withReset.reset === "function") {
    withReset.reset(); // clears bitmap, state stack, transform, and clip
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.filter = "none";
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
}
