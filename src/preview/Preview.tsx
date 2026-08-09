/** The two-strip preview.
 *
 *  The 192 x 24 canvas is never drawn as one rectangle: the strips are on
 *  opposite walls of a corridor and no one can see them as a single image. The
 *  gap between them is screen-space and fixed, so both stay visible at every
 *  zoom and vertical scrolling never happens.
 *
 *  Panning is a real scroll container rather than a transform. At 8x the canvas
 *  is 1,536 px wide and routinely wider than the window, and scrolling brings
 *  the wheel, the trackpad, the keyboard, and a position indicator with it —
 *  all of which would otherwise be hand-written.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BAND_HEIGHT, WIDTH } from "../runtime/geometry";
import type { Player } from "./player";

/** Integer zoom only. A preview pixel is always a whole number of screen
 *  pixels — fractional zoom makes some pixels 10 px wide and others 11.
 *
 *  Not exported: a module holding a component must export only components, or
 *  React Fast Refresh bails out and hot updates start replacing the module
 *  wholesale — which shows up as a blank page mid-session. */
const ZOOM_STEPS = [1, 2, 4, 6, 8] as const;

/** Screen pixels between the strips. Not adjustable: the walls are metres
 *  apart, so no width is "correct" and tuning one implies precision that does
 *  not exist. It only has to say *different wall*. */
const GAP = 64;
const RULER_HEIGHT = 20;
const GUTTER_WIDTH = 30;
const GUTTER_GAP = 8;
/** The controller seam — CTRL-A/B and CTRL-C/D meet here. */
const SEAM_COLUMN = 96;

interface PreviewProps {
  player: Player;
}

export function Preview({ player }: PreviewProps): React.ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const ruler = useRef<HTMLCanvasElement>(null);
  const gutter = useRef<HTMLCanvasElement>(null);

  const [viewWidth, setViewWidth] = useState(0);
  const [zoomChoice, setZoomChoice] = useState<number | "fit">("fit");

  const fitZoom =
    [...ZOOM_STEPS].reverse().find((z) => WIDTH * z <= viewWidth) ?? ZOOM_STEPS[0];
  const zoom = zoomChoice === "fit" ? fitZoom : zoomChoice;
  const contentWidth = WIDTH * zoom;
  const scrolls = viewWidth > 0 && contentWidth > viewWidth;
  const bandsHeight = BAND_HEIGHT * zoom * 2 + GAP;

  useEffect(() => {
    if (!right.current || !left.current) return;
    player.attach({ right: right.current, left: left.current });
    player.refresh();
  }, [player]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setViewWidth(el.clientWidth);
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

  // The scrollbar sits *above* the stage: a second scroll container holding
  // nothing but a spacer, kept in step with the real one. Flipping the stage
  // with a rotate hack would put a 3D transform under the canvases, and the
  // one thing this preview cannot afford is resampled pixels.
  const syncing = useRef(false);
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null): void => {
    if (syncing.current || !from || !to) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    // Cleared next frame: assigning scrollLeft fires the other element's
    // scroll event asynchronously, which would otherwise bounce straight back.
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  // Drag to throw the view around. Everything else — wheel, trackpad, arrow
  // keys, the scrollbar itself — the scroll container already does.
  const drag = useRef<{ pointer: number; x: number; scroll: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const el = scroller.current;
    if (event.button !== 0 || !el || !scrolls) return;
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

    const labelEvery = zoom >= 4 ? 16 : 32;
    for (let x = 0; x <= WIDTH; x += 8) {
      const px = Math.round(x * zoom) + 0.5;
      const major = x % labelEvery === 0;
      ctx.strokeStyle = major ? "#3b414c" : "#22262d";
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, major ? 7 : 4);
      ctx.stroke();
      if (major && x < WIDTH) {
        ctx.fillStyle = "#5a606b";
        ctx.fillText(String(x), px + 3, 7);
      }
    }
    const seam = Math.round(SEAM_COLUMN * zoom) + 0.5;
    ctx.strokeStyle = "#c2703a";
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, RULER_HEIGHT);
    ctx.stroke();
    ctx.fillStyle = "#c2703a";
    ctx.fillText("96", seam + 3, 7);
  }, [contentWidth, zoom]);

  // Row gutter: the same reference as the column ruler, for y. It reads in
  // canvas coordinates 0-23, because that is what a show's `pixel(x, y, t)`
  // is handed — not per-strip 0-11, which would be a second coordinate system
  // to hold in your head.
  useEffect(() => {
    const canvas = gutter.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(GUTTER_WIDTH * dpr);
    canvas.height = Math.round(bandsHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GUTTER_WIDTH, bandsHeight);
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";

    // A row is `zoom` pixels tall, so how many can be labelled is a function of
    // zoom alone: at 1x a whole strip is 12 px and only its ends fit.
    const step = zoom >= 6 ? 2 : zoom >= 3 ? 4 : 12;

    for (let band = 0; band < 2; band++) {
      const top = band * (BAND_HEIGHT * zoom + GAP);
      ctx.strokeStyle = "#22262d";
      ctx.beginPath();
      ctx.moveTo(GUTTER_WIDTH - 0.5, top);
      ctx.lineTo(GUTTER_WIDTH - 0.5, top + BAND_HEIGHT * zoom);
      ctx.stroke();

      for (let row = 0; row < BAND_HEIGHT; row += step) {
        const y = top + row * zoom + zoom / 2;
        ctx.strokeStyle = "#3b414c";
        ctx.beginPath();
        ctx.moveTo(GUTTER_WIDTH - 4.5, Math.round(y) + 0.5);
        ctx.lineTo(GUTTER_WIDTH - 0.5, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.fillStyle = "#5a606b";
        ctx.fillText(String(band * BAND_HEIGHT + row), GUTTER_WIDTH - 7, y);
      }
    }
  }, [bandsHeight, zoom]);

  const stripStyle = { width: `${contentWidth}px`, height: `${BAND_HEIGHT * zoom}px` };

  return (
    <section className="preview">
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
      </div>

      <div className="stage-frame">
        <div
          className="scrollbar-top"
          ref={scrollbar}
          style={{
            // Must line up with the scroller exactly, or the two have different
            // scrollable widths and the sync quietly stops halfway.
            marginLeft: GUTTER_WIDTH + GUTTER_GAP,
            visibility: scrolls ? "visible" : "hidden",
          }}
          onScroll={() => sync(scrollbar.current, scroller.current)}
        >
          <div style={{ width: `${contentWidth}px`, height: "1px" }} />
        </div>

        <div className="stage-row" style={{ gap: `${GUTTER_GAP}px` }}>
          <canvas
            className="row-gutter"
            ref={gutter}
            style={{ width: `${GUTTER_WIDTH}px`, height: `${bandsHeight}px` }}
          />

          <div
            className="stage"
            ref={scroller}
            tabIndex={0}
            role="group"
            aria-label="Ceiling preview — drag or scroll to pan"
            onScroll={() => sync(scroller.current, scrollbar.current)}
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
            <span className="wall-tag" style={{ top: BAND_HEIGHT * zoom + 5 }}>
              Right wall
            </span>
            <span className="wall-tag" style={{ top: BAND_HEIGHT * zoom + GAP - 20 }}>
              Left wall
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
