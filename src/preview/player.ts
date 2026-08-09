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
    // Assigning width/height clears the canvas, so only do it when it is
    // actually wrong: re-attaching must not wipe the frame on screen.
    const size = (canvas: HTMLCanvasElement, width: number, height: number): void => {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    size(targets.right, WIDTH, BAND_HEIGHT);
    size(targets.left, WIDTH, BAND_HEIGHT);
    const get = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Could not get a 2D context.");
      ctx.imageSmoothingEnabled = false;
      return ctx;
    };
    this.contexts = {
      right: get(targets.right),
      left: get(targets.left),
    };
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
    ctxs.right.drawImage(src, 0, 0, WIDTH, BAND_HEIGHT, 0, 0, WIDTH, BAND_HEIGHT);
    ctxs.left.drawImage(src, 0, BAND_HEIGHT, WIDTH, BAND_HEIGHT, 0, 0, WIDTH, BAND_HEIGHT);
  }

  /** Current frame index, for callers that need it outside the loop. */
  currentFrame(): number {
    if (!this.show) return 0;
    return Math.min(this.show.frames - 1, Math.floor(this.clock * this.show.fps));
  }

  dispose(): void {
    this.stop();
    this.contexts = null;
  }
}
