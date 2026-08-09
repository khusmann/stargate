/** End-to-end check of the bake: script → frames → zip → PNG.
 *
 *  Run with `npm test`. It bundles the real `src/` modules with esbuild (the
 *  same transform Vite uses), runs the exporter against a headless canvas shim,
 *  unzips the result, and decodes the PNGs with an independent decoder before
 *  asserting individual pixel values.
 *
 *  What it does not cover: the browser's own PNG encoder, and anything `draw`
 *  does with a real 2D context. Those live in the app.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { unzipSync } from "fflate";
import { installCanvasShim } from "./canvas-shim.mjs";
import { decodePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

installCanvasShim();

const bundle = await build({
  stdin: {
    contents: `
      export { compileShow } from "./src/runtime/compile.ts";
      export { FrameRenderer } from "./src/runtime/render.ts";
      export { exportShow, frameName, zipName } from "./src/export/exportShow.ts";
      export { applyBandReversal, WIDTH, HEIGHT } from "./src/runtime/geometry.ts";
      export { rgb, hsl } from "./src/runtime/color.ts";
      export { EXAMPLES } from "./src/examples/index.ts";
    `,
    resolveDir: root,
    sourcefile: "check-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "warning",
});

const code = bundle.outputFiles[0].text;
const sg = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
}

// --- colour helpers --------------------------------------------------------

check("rgb packs and clamps", () => {
  assert.equal(sg.rgb(255, 128, 0), 0xff8000);
  assert.equal(sg.rgb(-40, 300, 0), 0x00ff00);
});

check("hsl hits the primaries", () => {
  assert.equal(sg.hsl(0, 1, 0.5), 0xff0000);
  assert.equal(sg.hsl(120, 1, 0.5), 0x00ff00);
  assert.equal(sg.hsl(240, 1, 0.5), 0x0000ff);
  assert.equal(sg.hsl(-120, 1, 0.5), 0x0000ff, "hue wraps");
  assert.equal(sg.hsl(0, 0, 1), 0xffffff);
});

// --- the compiler ----------------------------------------------------------

check("compiles a show and reads its metadata", () => {
  const show = sg.compileShow(
    `export const name = "Demo", fps = 24, seconds = 2;
     export function pixel(x, y, t) { return rgb(x, y, t); }`,
  );
  assert.equal(show.name, "Demo");
  assert.equal(show.fps, 24);
  assert.equal(show.frames, 48);
  assert.equal(typeof show.pixel, "function");
  assert.equal(show.draw, undefined);
});

check("a show without `name` does not inherit window.name", () => {
  const show = sg.compileShow(`export function pixel() { return 0; }`);
  assert.equal(show.name, "Untitled");
});

check("`export` inside a string is left alone", () => {
  const show = sg.compileShow(
    'export const name = "export const fake = 1";\nexport function pixel() { return 0; }',
  );
  assert.equal(show.name, "export const fake = 1");
});

check("a throw at show scope reports its line", () => {
  assert.throws(
    () =>
      sg.compileShow(
        `export const fps = 30, seconds = 1;
export function pixel() { return 0; }
throw new Error("top level");`,
      ),
    (err) => {
      assert.equal(err.line, 3);
      assert.equal(err.phase, "compile");
      return true;
    },
  );
});

check("a throw inside pixel reports its line, once", () => {
  const show = sg.compileShow(
    `export const fps = 30, seconds = 1;
export function pixel(x, y, t) {
  if (x === 3 && y === 1) throw new Error("boom");
  return 0;
}`,
  );
  let thrown = 0;
  const renderer = new sg.FrameRenderer();
  assert.throws(
    () => {
      try {
        renderer.render(show, 0);
      } catch (err) {
        thrown++;
        throw err;
      }
    },
    (err) => {
      assert.equal(err.line, 3, "line of the throw");
      assert.match(err.message, /boom/);
      return true;
    },
  );
  assert.equal(thrown, 1, "4,608 pixels, one error");
});

check("a show that exports nothing is rejected", () => {
  assert.throws(() => sg.compileShow(`function pixel() { return 0; }`), /exports nothing/);
});

check("imports are rejected with an explanation", () => {
  assert.throws(
    () => sg.compileShow(`import x from "y";\nexport function pixel() { return 0; }`),
    /self-contained/,
  );
});

// --- the bundled examples --------------------------------------------------

check("every bundled example compiles and renders", () => {
  for (const example of sg.EXAMPLES) {
    const compiled = sg.compileShow(example.source);
    assert.equal(compiled.name, example.name, `${example.id} name matches the gallery`);
    assert.ok(compiled.pixel || compiled.draw, `${example.id} defines an entry point`);
    const renderer = new sg.FrameRenderer();
    for (const frame of [0, 1, Math.floor(compiled.frames / 3)]) {
      renderer.render(compiled, frame / compiled.fps);
    }
  }
});

check("every bundled example loops seamlessly", () => {
  // Negative control first: a show whose period does not divide `seconds` has
  // to fail this, or the test below proves nothing.
  const drifting = sg.compileShow(
    `export const name = "Drift", fps = 30, seconds = 5;
     export function pixel(x, y, t) { return rgb(t * 37 % 255, 0, 0); }`,
  );
  const control = new sg.FrameRenderer();
  control.render(drifting, 0);
  const a = Uint8Array.from(control.readPixels().data);
  control.render(drifting, drifting.frames / drifting.fps);
  const b = Uint8Array.from(control.readPixels().data);
  assert.notDeepEqual(a, b, "the control show should not close");

  for (const example of sg.EXAMPLES) {
    const compiled = sg.compileShow(example.source);
    const renderer = new sg.FrameRenderer();

    // The wall plays this for hours. Frame 0 is what follows the last frame,
    // so the show has to be exactly periodic in `seconds` — not approximately.
    renderer.render(compiled, 0);
    const first = Uint8Array.from(renderer.readPixels().data);
    renderer.render(compiled, compiled.frames / compiled.fps);
    const wrapped = Uint8Array.from(renderer.readPixels().data);

    let worst = 0;
    let where = -1;
    for (let i = 0; i < first.length; i++) {
      const diff = Math.abs(first[i] - wrapped[i]);
      if (diff > worst) {
        worst = diff;
        where = i;
      }
    }
    assert.equal(
      worst,
      0,
      `${example.id} does not close: channel ${where % 4} at (${
        Math.floor(where / 4) % 192
      }, ${Math.floor(where / 4 / 192)}) differs by ${worst}`,
    );
  }
});

// --- band reversal ---------------------------------------------------------

check("band reversal mirrors one strip and leaves the other alone", () => {
  const data = new Uint8ClampedArray(sg.WIDTH * sg.HEIGHT * 4);
  for (let y = 0; y < sg.HEIGHT; y++) {
    for (let x = 0; x < sg.WIDTH; x++) {
      data[(y * sg.WIDTH + x) * 4] = x;
    }
  }
  sg.applyBandReversal(data, "left");
  const at = (x, y) => data[(y * sg.WIDTH + x) * 4];
  assert.equal(at(0, 0), 0, "rows 0-11 untouched");
  assert.equal(at(5, 11), 5);
  assert.equal(at(0, 12), (sg.WIDTH - 1) & 0xff, "rows 12-23 reversed");
  assert.equal(at(sg.WIDTH - 1, 23), 0);
});

// --- the bake --------------------------------------------------------------

check("export names frames 1-based and zero-padded to five", () => {
  assert.equal(sg.frameName(1), "frames/frame-00001.png");
  assert.equal(sg.frameName(1350), "frames/frame-01350.png");
  assert.equal(sg.zipName("Warp Tunnel"), "Warp Tunnel.zip");
});

const FPS = 10;
const SECONDS = 0.5; // 5 frames — enough to prove time advances per frame
const show = sg.compileShow(`
export const name = "Check", fps = ${FPS}, seconds = ${SECONDS};

export function pixel(x, y, t) {
  if (x === 0 && y === 0) return rgb(255, 0, 0);
  if (x === 191 && y === 23) return rgb(0, 0, 255);
  return rgb(Math.round(t * ${FPS}) * 10, x % 256, y * 10);
}
`);

const progress = [];
const blob = await sg.exportShow(show, { onProgress: (p) => progress.push(p) });
const zipBytes = new Uint8Array(await blob.arrayBuffer());
const entries = unzipSync(zipBytes);
const names = Object.keys(entries).sort();

check("the zip holds exactly one PNG per frame", () => {
  assert.equal(show.frames, 5);
  assert.deepEqual(names, [
    "frames/frame-00001.png",
    "frames/frame-00002.png",
    "frames/frame-00003.png",
    "frames/frame-00004.png",
    "frames/frame-00005.png",
  ]);
});

check("progress is reported and ends at the last frame", () => {
  assert.ok(progress.length > 0);
  assert.deepEqual(progress.at(-1), { frame: show.frames, frames: show.frames });
});

check("every frame decodes as a 192 x 24 PNG with the expected pixels", () => {
  names.forEach((name, index) => {
    const image = decodePng(entries[name]);
    assert.equal(image.width, 192, `${name} width`);
    assert.equal(image.height, 24, `${name} height`);
    assert.equal(image.data.length, 192 * 24 * 4);

    const at = (x, y) => {
      const i = (y * 192 + x) * 4;
      return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
    };
    assert.deepEqual(at(0, 0), [255, 0, 0, 255], `${name} first pixel`);
    assert.deepEqual(at(191, 23), [0, 0, 255, 255], `${name} last pixel`);
    // Synthetic time: frame i is rendered at t = i / fps, so the red channel
    // steps by 10 per frame. This is what proves export is not wall-clock.
    assert.deepEqual(at(40, 5), [index * 10, 40, 50, 255], `${name} time-varying pixel`);
  });
});

check("stored, not deflated — the zip is not smaller than its PNGs", () => {
  const payload = names.reduce((sum, name) => sum + entries[name].length, 0);
  assert.ok(
    zipBytes.length >= payload,
    `zip ${zipBytes.length} < payload ${payload} — frames were re-compressed`,
  );
});

console.log(`\n${checks} checks passed`);
