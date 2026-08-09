/** The example picker.
 *
 *  A dropdown rather than a sidebar list, because the gallery is going to keep
 *  growing and a fixed column stops working around a dozen entries.
 *
 *  Every row renders a real frame of its own show. A name like "Domain Warp"
 *  tells you nothing; one frame tells you everything, and the renderer that
 *  makes that possible is already here. Thumbnails are rendered one per frame
 *  after the panel opens, so it appears instantly and fills in, and they are
 *  kept afterwards — a show is a pure function of t, so a frame never goes
 *  stale.
 */

import { useEffect, useRef, useState } from "react";
import { compileShow } from "../runtime/compile";
import { FrameRenderer } from "../runtime/render";
import { EXAMPLES, type Example } from "./index";

/** Frame to sample for a thumbnail — a third in, so nothing is caught at t=0
 *  before it has faded up. */
const SAMPLE = 0.31;

/** Thumbnails keep the split: two 192 x 12 bands with a gap, never one 192 x 24
 *  rectangle. It is two walls at any size. */
const GAP = 2;
const THUMB_W = 192;
const THUMB_H = 12 + GAP + 12;

interface ExampleMenuProps {
  onPick: (example: Example) => void;
}

export function ExampleMenu({ onPick }: ExampleMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  /** Rendered frames, kept in detached canvases so they survive the panel
   *  closing — the visible <canvas> elements unmount and lose their bitmaps. */
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  const mounted = useRef(new Map<string, HTMLCanvasElement>());

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Paint one thumbnail per animation frame: 16 shows at up to 16 ms each would
  // be a visible stall if they all ran on open.
  const show = (id: string, target: HTMLCanvasElement): void => {
    const frame = cache.current.get(id);
    const ctx = target.getContext("2d");
    if (!frame || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, THUMB_W, THUMB_H);
    ctx.drawImage(frame, 0, 0);
  };

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const queue = EXAMPLES.filter((example) => !cache.current.has(example.id));
    const renderer = new FrameRenderer();

    const step = (): void => {
      const example = queue.shift();
      if (!example) return;
      try {
        const compiled = compileShow(example.source);
        renderer.render(compiled, (SAMPLE * compiled.frames) / compiled.fps);
        const keep = document.createElement("canvas");
        keep.width = THUMB_W;
        keep.height = THUMB_H;
        const kept = keep.getContext("2d");
        if (kept) {
          kept.imageSmoothingEnabled = false;
          kept.drawImage(renderer.canvas, 0, 0, 192, 12, 0, 0, 192, 12);
          kept.drawImage(renderer.canvas, 0, 12, 192, 12, 0, 12 + GAP, 192, 12);
        }
        cache.current.set(example.id, keep);
        const target = mounted.current.get(example.id);
        if (target) show(example.id, target);
      } catch {
        // A broken example is the test suite's problem, not the menu's.
        cache.current.set(example.id, document.createElement("canvas"));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        title="Load one of the bundled examples"
        onClick={() => setOpen((v) => !v)}
      >
        Open example
        <span className="menu-caret">▾</span>
      </button>

      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-scroll">
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  onPick(example);
                  setOpen(false);
                }}
              >
                <canvas
                  className="thumb"
                  width={THUMB_W}
                  height={THUMB_H}
                  ref={(el) => {
                    if (el) {
                      mounted.current.set(example.id, el);
                      show(example.id, el);
                    } else {
                      mounted.current.delete(example.id);
                    }
                  }}
                />
                <span className="menu-item-name">{example.name}</span>
                <span className="dim">{example.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
