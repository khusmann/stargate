# Implementation brief — Stargate web editor (v1)

## Before you start

Read [DESIGN.md](DESIGN.md). It is the spec, and it records *why* each decision was made. [CLAUDE.md](CLAUDE.md) has the hardware background; [RESOURCES.md](RESOURCES.md) documents the file formats and the vendor toolchain.

Decisions in those documents are settled. If you think one is wrong, say so and stop — don't quietly build something else.

## What this is

A single-page web app for authoring shows on a 192 x 24 LED installation. A show is one JavaScript file. The app runs it, previews it on the real ceiling geometry, and exports the rendered PNG frames.

## Scope

**In:**

- CodeMirror 6 editor with hot reload
- The `pixel` / `draw` runtime
- The two-strip preview with transport, zoom, and pan
- Frame export as a zip
- Persistence (localStorage + URL fragment) and bundled examples
- The "Copy AI prompt" button and `stargate.d.ts`

**Out — do not build these:**

- **`.sho` generation.** Blocked on hardware verification that hasn't happened yet (see *Risk gates* in DESIGN.md). Export frames only. Leave a clean seam where it will slot in.
- **Image and video assets.** Deferred to v2. No `load()`, no asset drop target. `ctx.drawImage` will work by accident because `ctx` is a real canvas; that's fine, just don't document or depend on it.
- **File System Access API.** Zip download only — this is deliberate, not a fallback. It keeps the app working from `file://` and in non-Chromium browsers.

## Stack

- **TypeScript**, built with **Vite**. Two reasons over raw esbuild: HTML is a first-class entry point, so `vite-plugin-singlefile` gives the self-contained build below without hand-rolled glue; and React Fast Refresh makes the edit loop tolerable. Vite uses esbuild for transforms internally, so nothing is lost on speed.
- **React** for the UI chrome. ~45 KB gzipped is minor next to CodeMirror. There is more interrelated state here than it first appears — current frame, playing, zoom, pan offset, error, export progress, selected example, and an overview rectangle that tracks pan — and it is well-represented in training data, which matters on a project where much of the code will be AI-written.
- **CodeMirror 6** (`@codemirror/lang-javascript` + basic setup) for the editor. Mount it on a ref in an effect; do not add a React wrapper library.
- **fflate** for the zip.
- Deploys to **GitHub Pages**. `npm run build` must produce something Pages can serve statically.

Two build outputs, from the same source: the normal Pages build, and a **single self-contained HTML file** (`vite-plugin-singlefile`) that works opened directly from disk. The second is the offline path if the LSC machine turns out to have no internet. Note the plugin needs code-splitting disabled and a high `assetsInlineLimit`.

Keep the dependency list to Vite, React, CodeMirror, fflate, and the singlefile plugin. Anything else, ask first.

### The render loop does not go through React

This is the one rule that matters. React owns the chrome — controls, gallery, error display, layout. The per-frame path does not touch it.

- Advance the clock in a single `requestAnimationFrame` loop and write pixels straight to the canvas through a ref.
- **Never call `setState` per frame.** At 30 fps that is a re-render every 33 ms for no benefit.
- If a frame counter or scrub position must be displayed live, write `textContent` / the input's `value` directly in the same loop, or throttle updates to ~4 Hz.
- React state changes when the *show* changes — new script, new zoom level, play/pause toggled — not when a frame does.

## The runtime

A show is a JS module. It defines metadata and one or both entry points:

```js
export const name = "Warp Tunnel", fps = 30, seconds = 31;

export function pixel(x, y, t) { ... }   // returns a packed 24-bit colour
export function draw(ctx, t)   { ... }   // CanvasRenderingContext2D, 192x24
```

- `x` is 0–191, `y` is 0–23, `t` is seconds elapsed.
- `pixel` returns `rgb(r,g,b)` (0–255), `hsl(h,s,l)` (h 0–360, s/l 0–1), or a bare `0xRRGGBB` integer. **Packed integers only — never allocate per pixel.** A 30 s show at 30 fps is ~4.1M calls.
- If both are defined, `pixel` fills the frame first and `draw` composites on top.
- `rgb` and `hsl` are globals available to show code, not imports.

Evaluate show code with `new Function` or a blob module import — your call, but syntax errors and runtime throws must both be catchable and must carry a line number.

**Error handling matters here.** `pixel` runs 4,608 times per frame, so a throw must not fire 4,608 times. Catch the first one, stop rendering, surface it as an inline CodeMirror marker on the offending line, and leave the last good frame on screen.

## The preview

This is the part that justifies the project, so get the details right. All of these are deliberate — see *Preview* in DESIGN.md.

- **Two strips, drawn apart.** Rows 0–11 in one bar, rows 12–23 in another, with a large fixed gap between them. Never render the canvas as one 192 x 24 rectangle. The strips are on opposite walls of a corridor.
- **The gap is fixed and screen-space** — a constant number of screen pixels, not scaled by zoom, and not user-adjustable. Both strips therefore stay visible at every zoom level and vertical scrolling is never needed.
- **Integer zoom only**, nearest-neighbour (`image-rendering: pixelated`). Steps 1x/2x/4x/6x/8x, defaulting to the largest that fits the window width. Fractional zoom would make some pixels 10 screen-px wide and others 11 — never do it.
- **Horizontal pan is locked between the two strips.** They share a column index; comparing column N across both walls is most of the reason to zoom in. Drag, shift-wheel, and arrow keys.
- **Overview bar** — the full 192 columns at 1x with a viewport rectangle, always visible. The canvas is 16:1 and you lose your place instantly without it.
- **Column ruler** with column 96 marked — that's the controller boundary, the one seam that could show real artifacts.
- **Transport** — play/pause, scrub, frame step, loop, and a frame counter.

There is a working reference for the two-strip layout, zoom, and transport in [spike/generate.py](spike/generate.py) (`PREVIEW_CSS` / `PREVIEW_JS`, which generate a standalone player). Read it before writing your own — the geometry is already solved there.

## Export

Render every frame and download **one zip containing `frames/frame-%05d.png`**, 1-based, zero-padded to 5. That naming matches the convention already in use on this installation.

Two implementation requirements, both cheap and both load-bearing at longer show lengths:

- **Store, don't deflate.** PNGs are already compressed; re-deflating costs CPU and memory for nothing. Use fflate's level 0 for frames.
- **Stream it.** Encode one frame, discard its pixel buffer, feed fflate's streaming API, and accumulate chunks into a `Blob` — not one giant `ArrayBuffer`. Blob backing spills to disk; a typed array doesn't. Peak memory must be flat in show length, not linear.

Show a progress indicator; a 45 s show is 1,350 frames.

### One thing to stub, not solve

The two ceiling runs are wired **antiparallel** — column order is reversed on one strip relative to the other (see *The runs are antiparallel* in DESIGN.md). The exporter will eventually need to reverse column order for one band so authors can work in a single physical coordinate space.

**We don't yet know which band to reverse.** Implement it as a named constant with the transform written and defaulted to identity, plus a comment pointing at the open question. Do not guess.

## Persistence and sharing

- Current script in `localStorage`, restored on load.
- Script compressed into the URL fragment, so a link is a runnable show. Reading a fragment overrides localStorage.
- **Bundled examples** — see the next section.

## Bundled examples

Ship these four. They are the first thing anyone sees, they set the bar for what the tool is *for*, and they double as the smoke test. Use them as written or improve them — but keep the spread: two pure `pixel` demos, one `draw` demo, and one that teaches the two-wall split.

Everything here is tuned for a 16:1 strip. Radial and symmetric effects mostly die at this aspect ratio; motion along the 192 axis is what reads.

**1. Plasma** — the `pixel` hello-world. Shows the colour range immediately.

```js
export const name = "Plasma", fps = 30, seconds = 12;

export function pixel(x, y, t) {
  const v = Math.sin(x * 0.06 + t)
          + Math.sin(y * 0.30 - t * 1.3)
          + Math.sin((x + y) * 0.05 + t * 0.7);
  const n = (v + 3) / 6;                        // 0..1
  return hsl(n * 300 + t * 20, 0.9, 0.12 + n * 0.42);
}
```

Note the lightness varies with `n` rather than sitting at a constant `0.5`. Fixing lightness makes every pixel equally bright and only the hue move, which looks flat and runs the whole wall at full power. Vary brightness, not just colour — it is the difference between a plasma and a hue wash.

**2. Warp** — chevrons streaking down the corridor. Thematically the point of the installation, and it shows how much a sharp leading edge plus a long tail reads at this size.

```js
export const name = "Warp", fps = 30, seconds = 10;

export function pixel(x, y, t) {
  const d = (x - t * 90 + 1920) % 24;               // repeats every 24 px
  const head = Math.max(0, 1 - d / 2);              // bright leading edge
  const tail = Math.max(0, 1 - d / 18) * 0.5;       // long fading tail
  const v = Math.min(1, head + tail);
  const centre = 1 - Math.abs((y % 12) - 5.5) / 7;  // brighter mid-strip
  return hsl(195, 0.9, v * centre * 0.6);
}
```

**3. Starfield** — the `draw` demo. Discrete, hard-edged, stateful: exactly what a shader is bad at. Note the per-star allocation is fine at 60 objects per frame; the rule is only about per-*pixel* allocation.

```js
export const name = "Starfield", fps = 30, seconds = 20;

const stars = Array.from({ length: 60 }, () => ({
  y: Math.floor(Math.random() * 24),
  speed: 20 + Math.random() * 90,
  len: 2 + Math.floor(Math.random() * 6),
  offset: Math.random() * 192,
}));

export function draw(ctx, t) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 192, 24);
  for (const s of stars) {
    const x = (s.offset + t * s.speed) % 210 - 10;
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.65 * s.speed / 110).toFixed(2)})`;
    ctx.fillRect(x, s.y, s.len, 1);
  }
}
```

**4. Twin** — the teaching example. The two strips face each other across the room, so this makes them deliberately different: opposite colours, opposite directions. Demonstrates the `y < 12` and `y % 12` idioms in four lines.

```js
export const name = "Twin", fps = 30, seconds = 14;

export function pixel(x, y, t) {
  const wall = y < 12 ? 0 : 1;     // opposite sides of the corridor
  const row  = y % 12;             // position across the strip
  const dir  = wall ? -1 : 1;      // travelling opposite ways
  const v = Math.sin(x * 0.08 + dir * t * 2 + row * 0.15);
  return hsl(wall ? 20 : 200, 0.9, Math.max(0, v) ** 2 * 0.55);
}
```

Default to **Plasma** on first load.

## The AI prompt button

Copies a self-contained authoring brief to the clipboard: `stargate.d.ts`, the canvas geometry (192 x 24, two 192 x 12 strips on opposite walls, `y < 12` is one wall), the colour helpers, and one worked example.

`stargate.d.ts` is the single source of truth for three consumers: this prompt, the editor's completions, and human documentation. Drive CodeMirror's completion source from it rather than duplicating the symbol list. Keep the whole payload under ~100 lines — an API that doesn't fit in one prompt is one an AI will hallucinate against.

## Easy things to get wrong

1. Rendering the preview as one 192 x 24 rectangle. The split is the product.
2. Fractional zoom, or smoothed scaling in the preview.
3. Allocating an object, array, or string per pixel.
4. Driving the frame loop through React state.
5. Letting a throw inside `pixel` fire thousands of times.
6. Buffering the whole zip in one `ArrayBuffer`.
7. Guessing which strip to reverse.

## Definition of done

- `npm run build` emits a self-contained HTML file that works when opened directly from disk.
- Loading the app with no saved state shows a bundled example, animating.
- Editing the script updates the preview without a reload; a syntax error shows an inline marker and keeps the last good frame.
- Zoom, pan, overview, and transport all behave as specified.
- Export produces a zip whose frames decode as 192 x 24 PNGs. Include a check — even a script that renders a known pattern and asserts a few pixel values — so this is verified rather than assumed.
- README covers `npm run dev`, `npm run build`, and how to deploy to Pages.
