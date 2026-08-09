/** Bake a show to a zip of PNG frames.
 *
 *  This is not the preview loop, and the differences are the whole point:
 *  time is synthetic (frame `i` is rendered at `t = i / fps`, as fast as the
 *  machine can), the canvas is always exactly 192 x 24 regardless of preview
 *  zoom, and nothing is ever read back from the zoomed preview.
 */

import { REVERSED_BAND, WIDTH, HEIGHT, applyBandReversal } from "../runtime/geometry";
import { FrameRenderer } from "../runtime/render";
import type { Show } from "../runtime/compile";
import { ZipStream } from "./zip";

export interface ExportProgress {
  frame: number;
  frames: number;
}

export interface ExportOptions {
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

/** Report progress and hand the tab back this often. */
const YIELD_EVERY = 20;

export class ExportCancelled extends Error {
  constructor() {
    super("Export cancelled.");
    this.name = "ExportCancelled";
  }
}

export function frameName(index1: number): string {
  return `frames/frame-${String(index1).padStart(5, "0")}.png`;
}

/** `Warp Tunnel` → `Warp Tunnel.zip`, minus anything Windows dislikes. */
export function zipName(showName: string): string {
  const safe = showName.replace(/[<>:"/\\|?*]+/g, "").trim();
  return `${safe === "" ? "Show" : safe}.zip`;
}

async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("The browser failed to encode a PNG frame.");
  return new Uint8Array(await blob.arrayBuffer());
}

const nextTask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export async function exportShow(show: Show, options: ExportOptions = {}): Promise<Blob> {
  const { onProgress, signal } = options;
  const renderer = new FrameRenderer();
  const zip = new ZipStream();
  const stamp = new Date();

  try {
    for (let i = 0; i < show.frames; i++) {
      if (signal?.aborted) throw new ExportCancelled();

      renderer.render(show, i / show.fps);

      // The two ceiling runs are wired antiparallel, so one band's columns get
      // reversed on the way out — see REVERSED_BAND in runtime/geometry.ts.
      // Identity until the wall tells us which band it is, hence the guard:
      // a getImageData/putImageData round trip per frame is not free.
      if (REVERSED_BAND !== null) {
        const ctx = renderer.canvas.getContext("2d");
        if (ctx) {
          const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
          applyBandReversal(image.data);
          ctx.putImageData(image, 0, 0);
        }
      }

      zip.add(frameName(i + 1), await encodePng(renderer.canvas), stamp);

      if (i % YIELD_EVERY === 0 || i === show.frames - 1) {
        onProgress?.({ frame: i + 1, frames: show.frames });
        await nextTask();
      }
    }

    // Seam for `.sho` generation: it is one more `zip.add("Show.sho", …)` here,
    // once the hardware questions in DESIGN.md → Risk gates are answered.
    return await zip.close();
  } catch (err) {
    zip.abort();
    throw err;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke late: Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
