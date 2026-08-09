/** Just enough <canvas> for the export path to run under Node.
 *
 *  Only the operations the exporter actually performs are implemented — a
 *  reused ImageData, putImageData/getImageData, fillRect, and toBlob. Anything
 *  a `draw` show reaches for beyond that is out of scope here; `draw` is
 *  exercised in the browser, where the context is real.
 */

import { encodePng } from "./png.mjs";

function parseColor(style) {
  if (typeof style !== "string") return [0, 0, 0, 255];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(style.trim());
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      255,
    ];
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(style.trim());
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => Number(p.trim()));
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0, Math.round((parts[3] ?? 1) * 255)];
  }
  return [0, 0, 0, 255];
}

class FakeImageData {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }
}

class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
    this.lineWidth = 1;
    this.shadowBlur = 0;
    this.shadowColor = "rgba(0,0,0,0)";
    this.filter = "none";
    this.imageSmoothingEnabled = false;
  }

  createImageData(width, height) {
    return new FakeImageData(width, height);
  }

  putImageData(image, dx, dy) {
    const { width } = this.canvas;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const from = (y * image.width + x) * 4;
        const to = ((y + dy) * width + (x + dx)) * 4;
        this.pixels.set(image.data.subarray(from, from + 4), to);
      }
    }
  }

  getImageData(x, y, width, height) {
    const out = new FakeImageData(width, height);
    for (let row = 0; row < height; row++) {
      const from = ((y + row) * this.canvas.width + x) * 4;
      out.data.set(this.pixels.subarray(from, from + width * 4), row * width * 4);
    }
    return out;
  }

  fillRect(x, y, w, h) {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const alpha = a * this.globalAlpha;
    for (let py = Math.max(0, Math.round(y)); py < Math.min(this.canvas.height, Math.round(y + h)); py++) {
      for (let px = Math.max(0, Math.round(x)); px < Math.min(this.canvas.width, Math.round(x + w)); px++) {
        const i = (py * this.canvas.width + px) * 4;
        const t = alpha / 255;
        this.pixels[i] = this.pixels[i] * (1 - t) + r * t;
        this.pixels[i + 1] = this.pixels[i + 1] * (1 - t) + g * t;
        this.pixels[i + 2] = this.pixels[i + 2] * (1 - t) + b * t;
        this.pixels[i + 3] = Math.max(this.pixels[i + 3], alpha);
      }
    }
  }

  clearRect(x, y, w, h) {
    const saved = this.fillStyle;
    const savedAlpha = this.globalAlpha;
    this.fillStyle = "#000000";
    this.globalAlpha = 1;
    this.fillRect(x, y, w, h);
    this.fillStyle = saved;
    this.globalAlpha = savedAlpha;
  }

  reset() {
    this.pixels.fill(0);
    this.fillStyle = "#000000";
    this.globalAlpha = 1;
  }

  /** Enough for `ctx.copy()`: an unscaled blit between two rectangles of the
   *  same canvas. Scaling and image sources are the browser's problem. */
  drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (source !== this.canvas || sw !== dw || sh !== dh) {
      throw new Error("the Node canvas shim only blits this canvas 1:1");
    }
    const stride = this.canvas.width * 4;
    const copy = this.pixels.slice();
    for (let row = 0; row < sh; row++) {
      const from = (sy + row) * stride + sx * 4;
      this.pixels.set(copy.subarray(from, from + sw * 4), (dy + row) * stride + dx * 4);
    }
  }

  // Text is measured crudely and not rasterised: the shim exists to prove shows
  // run, and glyph rendering is the browser's job.
  measureText(text) {
    return { width: text.length * 6 };
  }
  fillText() {}
  strokeText() {}

  // Present so the runtime can call them; the export check does not rely on them.
  save() {}
  restore() {}
  beginPath() {}
  rect() {}
  clip() {}
  setTransform() {}
}

class FakeCanvas {
  constructor() {
    this.width = 300;
    this.height = 150;
    this.context = null;
  }

  getContext(kind) {
    if (kind !== "2d") return null;
    if (!this.context) this.context = new FakeContext(this);
    return this.context;
  }

  toBlob(callback) {
    const ctx = this.getContext("2d");
    const png = encodePng(this.width, this.height, ctx.pixels);
    callback(new Blob([png], { type: "image/png" }));
  }
}

/** Install the shim on globalThis. Idempotent. */
export function installCanvasShim() {
  if (!globalThis.document) {
    globalThis.document = {
      createElement(tag) {
        if (tag === "canvas") return new FakeCanvas();
        throw new Error(`the Node shim only creates <canvas>, not <${tag}>`);
      },
    };
  }
  if (!globalThis.ImageData) globalThis.ImageData = FakeImageData;
}
