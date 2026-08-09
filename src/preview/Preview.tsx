/** The two-strip preview.
 *
 *  The 192 x 24 canvas is never drawn as one rectangle: the strips are on
 *  opposite walls of a corridor and no one can see them as a single image. The
 *  gap between them is screen-space and fixed, so both stay visible at every
 *  zoom and vertical scrolling never happens.
 *
 *  Panning is a plain scroll container. It brings the wheel, the trackpad, the
 *  keyboard, and a position indicator with it, all of which would otherwise be
 *  hand-written — and its scrollbar takes space only when there is something to
 *  scroll, which at `fit` is never: fit is by definition the largest zoom that
 *  does fit. It appears when you pick a zoom above that.
 *
 *  No minimap. One would earn its place if the viewport showed a small fraction
 *  of the wall, but it barely does: at 8x in a 900 px window you can still see
 *  54% of the columns, and a full-width overview of all 192 would be ~8 px per
 *  column — the zoom level you are already at.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BAND_HEIGHT, WIDTH } from "../runtime/geometry";
import type { PixelStyle, Player } from "./player";

/** Integer zoom only. A preview pixel is always a whole number of screen
 *  pixels — fractional zoom makes some pixels 10 px wide and others 11.
 *
 *  Starts at 4x. Below that an LED and the dark gap beside it would be one
 *  screen pixel each, so the emitter view degenerates into mush and the whole
 *  wall is 384 px anyway — there is nothing to see at 1x that 4x does not show.
 *
 *  Not exported: a module holding a component must export only components, or
 *  React Fast Refresh bails out and hot updates start replacing the module
 *  wholesale — which shows up as a blank page mid-session. */
const ZOOM_STEPS = [4, 6, 8, 10] as const;

/** `fit` is not restricted to the ladder above — it takes the largest whole
 *  number of screen pixels per wall pixel that the viewport allows. The ladder
 *  is for choosing quickly; fit is for using the window. Restricting it to the
 *  listed steps left 400 px of dead space on a wide monitor (where 10x fits but
 *  13x also would) and overflowed by 400 px on a phone (where even 4x does not).
 *
 *  The emitter view needs at least 4 px per pixel to read, so below that the
 *  preview falls back to flat squares on its own. */
const LED_MIN_ZOOM = 4;
/** Ceiling on fit. At 16x a strip's backing store is already ~9 MB in LED mode
 *  on a HiDPI screen, and nothing is gained past the point where a wall pixel
 *  is a thumbnail. */
const FIT_MAX_ZOOM = 16;

/** Screen pixels between the strips. Not adjustable: the walls are metres
 *  apart, so no width is "correct" and tuning one implies precision that does
 *  not exist. It only has to say *different wall*. */
const GAP = 64;
const RULER_HEIGHT = 20;
/** The controller seam — CTRL-A/B and CTRL-C/D meet here. */
const SEAM_COLUMN = 96;

/** Horizontal chrome the frame adds around the strips: padding both sides plus
 *  its border. Zoom is measured against the *available* width, not the frame's
 *  own width — the frame shrink-wraps its content, so measuring it would be
 *  circular and collapses to 1x. */
const FRAME_CHROME = 12 * 2 + 1 * 2;

interface PreviewProps {
  player: Player;
}

export function Preview({ player }: PreviewProps): React.ReactElement {
  const section = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const ruler = useRef<HTMLCanvasElement>(null);

  /** Width the strips may occupy: the section, less the frame's own chrome. */
  const [viewWidth, setViewWidth] = useState(0);
  const [zoomChoice, setZoomChoice] = useState<number | "fit">("fit");
  // LEDs by default: it is what the room looks like, and the flat view is the
  // one you switch to when you need to read exact pixels.
  const [pixelStyle, setPixelStyle] = useState<PixelStyle>("led");

  const fitZoom = Math.max(
    1,
    Math.min(FIT_MAX_ZOOM, Math.floor(viewWidth / WIDTH)),
  );
  const zoom = zoomChoice === "fit" ? fitZoom : zoomChoice;
  const ledsReadable = zoom >= LED_MIN_ZOOM;
  const contentWidth = WIDTH * zoom;
  const scrolls = viewWidth > 0 && contentWidth > viewWidth;

  useEffect(() => {
    if (!right.current || !left.current) return;
    player.attach({ right: right.current, left: left.current });
    player.refresh();
  }, [player]);

  // The backing store depends on both, so the player owns the resize.
  useEffect(() => {
    player.setDisplay(ledsReadable ? pixelStyle : "square", zoom);
  }, [player, pixelStyle, zoom, ledsReadable]);

  useLayoutEffect(() => {
    const el = section.current;
    if (!el) return;
    const measure = (width: number): void =>
      setViewWidth(Math.max(WIDTH, width - FRAME_CHROME));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(el);
    measure(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Keep the column that was in the middle of the view in the middle of it.
  const holdColumn = useRef<number | null>(null);
  const zoomTo = (next: number | "fit"): void => {
    const el = scroller.current;
    holdColumn.current = el ? (el.scrollLeft + el.clientWidth / 2) / zoom : WIDTH / 2;
    setZoomChoice(next);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    const column = holdColumn.current;
    if (!el || column === null) return;
    el.scrollLeft = column * zoom - el.clientWidth / 2;
    holdColumn.current = null;
  }, [zoom]);

  // Drag to throw the view around. Everything else — wheel, trackpad, arrow
  // keys, the scrollbar itself — the scroll container already does.
  const drag = useRef<{ pointer: number; x: number; scroll: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const el = scroller.current;
    // Mouse only. A touch drag is already scrolling the container natively, and
    // moving scrollLeft underneath it makes the strip travel at double speed.
    if (event.pointerType !== "mouse" || event.button !== 0 || !el || !scrolls) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, scroll: el.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    const el = scroller.current;
    if (!state || !el || state.pointer !== event.pointerId) return;
    el.scrollLeft = state.scroll - (event.clientX - state.x);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };

  // The column ruler is static per zoom level, so redraw only when zoom changes.
  useEffect(() => {
    const canvas = ruler.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(contentWidth * dpr);
    canvas.height = Math.round(RULER_HEIGHT * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentWidth, RULER_HEIGHT);
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";

    // Measured, not guessed: at 1x the whole ruler is 192 px wide and "160"
    // and "192" are each about a tenth of it.
    const edgeLabel = String(WIDTH);
    const edgeRoom = ctx.measureText(edgeLabel).width + 10;

    const labelEvery = zoom >= 4 ? 16 : 32;
    for (let x = 0; x < WIDTH; x += 8) {
      const px = Math.round(x * zoom) + 0.5;
      const major = x % labelEvery === 0;
      ctx.strokeStyle = major ? "#3b414c" : "#22262d";
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, major ? 7 : 4);
      ctx.stroke();
      // Leave room for the edge label, or at 1x "160" and "192" collide.
      const label = String(x);
      if (major && px + 3 + ctx.measureText(label).width < contentWidth - edgeRoom) {
        ctx.fillStyle = "#5a606b";
        ctx.fillText(label, px + 3, 7);
      }
    }

    // The far edge, drawn explicitly: a tick at x = WIDTH would land one pixel
    // outside the canvas and be clipped, and its label would run off the end.
    // Knowing where the wall stops is worth the special case.
    const edge = contentWidth - 0.5;
    ctx.strokeStyle = "#3b414c";
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, 7);
    ctx.stroke();
    ctx.fillStyle = "#5a606b";
    ctx.textAlign = "right";
    ctx.fillText(edgeLabel, edge - 3, 7);
    ctx.textAlign = "left";
    const seam = Math.round(SEAM_COLUMN * zoom) + 0.5;
    ctx.strokeStyle = "#c2703a";
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, RULER_HEIGHT);
    ctx.stroke();
    ctx.fillStyle = "#c2703a";
    ctx.fillText("96", seam + 3, 7);
  }, [contentWidth, zoom]);

  const stripStyle = { width: `${contentWidth}px`, height: `${BAND_HEIGHT * zoom}px` };
  /** Where the strip actually starts: centred when it fits, hard left when it
   *  is scrolling. The wall tags follow it rather than the frame. */
  const stripLeft = Math.max(0, (viewWidth - contentWidth) / 2);

  return (
    <section className="preview" ref={section}>
      <div className="preview-bar">
        <span className="preview-label">Preview</span>
        <div className="zoom">
          <span className="dim">zoom</span>
          {ZOOM_STEPS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoomChoice !== "fit" && zoom === z}
              onClick={() => zoomTo(z)}
            >
              {z}x
            </button>
          ))}
          <button
            type="button"
            aria-pressed={zoomChoice === "fit"}
            onClick={() => zoomTo("fit")}
          >
            fit
          </button>
        </div>

        <div className="zoom">
          <span className="dim">pixels</span>
          <button
            type="button"
            aria-pressed={pixelStyle === "square"}
            onClick={() => setPixelStyle("square")}
            title="Flat pixels — what the exported frames contain"
          >
            flat
          </button>
          <button
            type="button"
            aria-pressed={pixelStyle === "led" && ledsReadable}
            disabled={!ledsReadable}
            onClick={() => setPixelStyle("led")}
            title={
              ledsReadable
                ? "Round emitters on a dark pitch, like the real modules"
                : `Needs ${LED_MIN_ZOOM}x or more — an emitter and its gap would be one screen pixel each`
            }
          >
            LEDs
          </button>
        </div>
      </div>

      <div className="stage-frame">
        <div className="stage-row">
          <div
            className="stage"
            ref={scroller}
            tabIndex={0}
            role="group"
            aria-label="Ceiling preview — drag or scroll to pan"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: scrolls ? "grab" : "default" }}
          >
            {/* Narrower than the view: centred by `margin: 0 auto` rather than
                hanging off the left edge. Wider: the scroller takes over. */}
            <div className="pan" style={{ width: `${contentWidth}px` }}>
              <canvas className="strip" ref={right} style={stripStyle} />
              <div className="corridor" style={{ height: `${GAP}px` }} />
              <canvas className="strip" ref={left} style={stripStyle} />
              <canvas
                className="ruler"
                ref={ruler}
                style={{ width: `${contentWidth}px`, height: `${RULER_HEIGHT}px` }}
              />
            </div>
          </div>

          {/* Pinned to the frame rather than the scrolling content, and sitting
              inside the corridor gap — anywhere else covers a strip at 1x. */}
          <div className="stage-labels" aria-hidden="true">
            <span
              className="wall-tag"
              style={{ top: BAND_HEIGHT * zoom + 5, left: stripLeft }}
            >
              Right wall · rows 0–11
            </span>
            <span
              className="wall-tag"
              style={{ top: BAND_HEIGHT * zoom + GAP - 20, left: stripLeft }}
            >
              Left wall · rows 12–23
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
