/** The playback loop. Deliberately outside React.
 *
 *  React owns the chrome; this owns the clock and the pixels. Nothing in here
 *  calls setState per frame — the frame counter and scrubber are written to the
 *  DOM directly through the `onFrame` callback.
 */

import { BAND_HEIGHT, WIDTH } from "../runtime/geometry";
import { FrameRenderer } from "../runtime/render";
import { ShowError, toShowError } from "../runtime/errors";
import type { Show } from "../runtime/compile";

export interface PlayerTargets {
  right: HTMLCanvasElement;
  left: HTMLCanvasElement;
}

/** How a wall pixel is drawn.
 *
 *  `square` is the cheap path: a 192 x 12 backing store scaled up by CSS with
 *  nearest-neighbour, so the browser does the zoom for free.
 *
 *  `led` draws what the ceiling actually is — a grid of small round emitters
 *  with dark space between them, pitched so the gap is about the size of the
 *  emitter. It is not per-pixel drawing: 4,608 arcs a frame would be far too
 *  slow. The strip is blitted blocky at device resolution and then a repeating
 *  circle pattern is punched through it with `destination-in`, which is two
 *  draw calls per strip however many LEDs there are. */
export type PixelStyle = "square" | "led";

/** Emitter diameter as a fraction of the pixel pitch. Around half means the dark
 *  gap between two LEDs is about the size of an LED, which is roughly the real
 *  module — a little over, because the diffuser makes the lit area wider than
 *  the die. */
const LED_FILL = 0.58;

/** Where the emitter stops being solid and starts falling off. A hard-edged
 *  disc reads as a printed dot; real ones have a soft shoulder. */
const LED_CORE = 0.62;

/** Strength of the bleed between emitters.
 *
 *  Masking alone loses about 80% of the light, because that is how much of the
 *  wall is dark gap — which is true, and looks wrong, because it throws away
 *  the halo that makes a real LED wall read as bright. This adds it back as a
 *  smoothly interpolated copy of the same frame composited with `lighter`: each
 *  emitter spills into its neighbours, exactly like the diffuser does, and the
 *  colour is still the show's own. Brightness is not scaled anywhere — an
 *  author judging levels is judging the real ones. */
const LED_BLOOM = 0.45;

export interface PlayerCallbacks {
  /** Every rendered frame. Write to the DOM here; never call setState. */
  onFrame?: (frame: number, frames: number) => void;
  /** Playback stopped or started for a reason React needs to know about. */
  onPlayingChange?: (playing: boolean) => void;
  onError?: (error: ShowError | null) => void;
}

export class Player {
  private readonly renderer = new FrameRenderer();
  private contexts: {
    right: CanvasRenderingContext2D;
    left: CanvasRenderingContext2D;
  } | null = null;

  private targets: PlayerTargets | null = null;
  private style: PixelStyle = "square";
  private zoom = 1;
  private ledPattern: CanvasPattern | null = null;
  private show: Show | null = null;
  private clock = 0;
  private playing = false;
  private looping = true;
  private raf = 0;
  private lastTime = 0;
  private lastRendered = -1;
  private dirty = true;
  private failed = false;

  constructor(private readonly callbacks: PlayerCallbacks = {}) {}

  attach(targets: PlayerTargets): void {
    this.targets = targets;
    const get = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Could not get a 2D context.");
      return ctx;
    };
    this.contexts = { right: get(targets.right), left: get(targets.left) };
    this.applyDisplay();
  }

  /** Set how pixels are drawn and at what zoom. Both change the size of the
   *  backing store, so this is also where the canvases get resized. */
  setDisplay(style: PixelStyle, zoom: number): void {
    if (this.style === style && this.zoom === zoom) return;
    this.style = style;
    this.zoom = zoom;
    this.applyDisplay();
    this.refresh();
  }

  private applyDisplay(): void {
    const targets = this.targets;
    const contexts = this.contexts;
    if (!targets || !contexts) return;

    // In square mode the backing store is one texel per wall pixel and CSS does
    // the enlarging. In LED mode it has to hold real geometry, so it is sized in
    // device pixels — which is also what keeps the circles crisp on a HiDPI
    // screen instead of being upscaled by the compositor.
    const dpr = this.style === "led" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const cell = this.style === "led" ? Math.max(2, Math.round(this.zoom * dpr)) : 1;
    const width = WIDTH * cell;
    const height = BAND_HEIGHT * cell;

    // Assigning width/height clears the canvas, so only do it when it is
    // actually wrong: re-applying must not wipe the frame on screen.
    for (const canvas of [targets.right, targets.left]) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    contexts.right.imageSmoothingEnabled = false;
    contexts.left.imageSmoothingEnabled = false;

    this.ledPattern =
      this.style === "led" ? makeLedPattern(contexts.right, cell) : null;
    this.dirty = true;
  }

  start(): void {
    if (this.raf) return;
    this.lastTime = performance.now();
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick);
      this.step(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setShow(show: Show | null): void {
    const previous = this.show;
    this.show = show;
    this.failed = false;
    this.dirty = true;
    this.lastRendered = -1;
    // Keep the playhead across a hot reload, so tweaking a line does not throw
    // you back to t = 0 — but re-clamp if the show got shorter.
    if (show && previous && show.frames !== previous.frames) {
      this.clock = Math.min(this.clock, (show.frames - 1) / show.fps);
    }
    if (!previous && show) this.clock = 0;
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.lastTime = performance.now();
    this.callbacks.onPlayingChange?.(playing);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setLooping(looping: boolean): void {
    this.looping = looping;
  }

  /** Jump to an absolute frame index. */
  seek(frame: number): void {
    if (!this.show) return;
    const clamped = Math.max(0, Math.min(this.show.frames - 1, Math.round(frame)));
    this.clock = clamped / this.show.fps;
    this.failed = false;
    this.dirty = true;
  }

  step(now: number): void {
    const { show } = this;
    if (!show || this.failed) return;

    const dt = Math.min(0.25, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const duration = show.frames / show.fps;
    if (this.playing) {
      this.clock += dt;
      if (this.clock >= duration) {
        if (this.looping) {
          this.clock %= duration;
        } else {
          this.clock = duration - 1 / show.fps;
          this.setPlaying(false);
        }
      }
    }

    const frame = Math.min(show.frames - 1, Math.floor(this.clock * show.fps));
    if (!this.dirty && frame === this.lastRendered) return;

    this.renderFrame(show, frame);
  }

  /** Render one frame now, outside the clock — used after a hot reload. */
  refresh(): void {
    if (!this.show) return;
    const frame = Math.min(this.show.frames - 1, Math.floor(this.clock * this.show.fps));
    this.renderFrame(this.show, frame);
  }

  private renderFrame(show: Show, frame: number): void {
    // Quantise to the frame grid so the preview shows exactly the images the
    // exporter will write — never an interpolated in-between time.
    const t = frame / show.fps;
    try {
      this.renderer.render(show, t);
    } catch (err) {
      // Leave the last good frame on screen and stop, rather than flashing
      // black or throwing once per pixel.
      this.failed = true;
      this.setPlaying(false);
      this.callbacks.onError?.(toShowError(err, "render"));
      return;
    }
    this.dirty = false;
    this.lastRendered = frame;
    this.blit();
    this.callbacks.onFrame?.(frame, show.frames);
  }

  private blit(): void {
    const ctxs = this.contexts;
    if (!ctxs) return;
    const src = this.renderer.canvas;
    this.blitBand(ctxs.right, src, 0);
    this.blitBand(ctxs.left, src, BAND_HEIGHT);
  }

  private blitBand(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    top: number,
  ): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // `copy` rather than `source-over` plus a clear: one pass, and it discards
    // whatever the previous frame left outside the emitters.
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(src, 0, top, WIDTH, BAND_HEIGHT, 0, 0, width, height);

    if (this.ledPattern) {
      // Keep only what falls inside an emitter. The pattern repeats from the
      // canvas origin, which is the pixel grid origin, so every circle lands in
      // the middle of its own wall pixel.
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = this.ledPattern;
      ctx.fillRect(0, 0, width, height);

      // Then the bloom: the same frame again, bilinear rather than blocky, added
      // on top. The smoothing is what spreads each pixel across its neighbours,
      // so one extra draw buys the whole halo.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = LED_BLOOM;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, top, WIDTH, BAND_HEIGHT, 0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** Current frame index, for callers that need it outside the loop. */
  currentFrame(): number {
    if (!this.show) return 0;
    return Math.min(this.show.frames - 1, Math.floor(this.clock * this.show.fps));
  }

  dispose(): void {
    this.stop();
    this.contexts = null;
    this.targets = null;
    this.ledPattern = null;
  }
}

/** One cell of the emitter mask: an opaque circle on transparent, tiled. */
function makeLedPattern(
  ctx: CanvasRenderingContext2D,
  cell: number,
): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = cell;
  tile.height = cell;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return null;
  const centre = cell / 2;
  const radius = (cell * LED_FILL) / 2;
  const glow = tileCtx.createRadialGradient(centre, centre, 0, centre, centre, radius);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(LED_CORE, "rgba(255,255,255,1)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  tileCtx.fillStyle = glow;
  tileCtx.beginPath();
  tileCtx.arc(centre, centre, radius, 0, Math.PI * 2);
  tileCtx.fill();
  return ctx.createPattern(tile, "repeat");
}
