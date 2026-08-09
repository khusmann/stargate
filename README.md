# Stargate

An authoring tool for a 192 x 24 LED installation: two 192 x 12 strips running
along either side of a corridor ceiling. Write a show as one JavaScript file,
watch it on the real geometry, export the baked PNG frames as a zip.

No server, no install, no accounts. A show is a file of code.

See [DESIGN.md](DESIGN.md) for why it is built this way, [CLAUDE.md](CLAUDE.md)
for the hardware, and [IMPLEMENT.md](IMPLEMENT.md) for the v1 brief.

## Running it

```sh
npm install
npm run dev          # http://localhost:5173/stargate/
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload; type errors appear in the browser overlay |
| `npm run build` | Static site into `dist/`, for GitHub Pages |
| `npm run build:single` | One self-contained `dist-single/index.html`, works from `file://` |
| `npm run typecheck` | `tsc --noEmit` under `strict` — the actual authority on types |
| `npm test` | Headless end-to-end check of the bake (see below) |

The single-file build is the offline path: if the machine running Light System
Composer has no internet, copy that one HTML file across and double-click it.
Everything works from `file://`, which is why export is a zip download rather
than the File System Access API.

## Writing a show

A show is a JS module with metadata and one or both entry points:

```js
export const name = "Plasma", fps = 30, seconds = 12;

export function pixel(x, y, t) { ... }   // shader — returns a packed 0xRRGGBB
export function draw(ctx, t)   { ... }   // canvas — composites on top
```

`x` is 0–191, `y` is 0–23, `t` is seconds. `rgb(r,g,b)` and `hsl(h,s,l)` are
globals. `pixel` runs first and fills the frame; `draw` gets a real
`CanvasRenderingContext2D` for hard-edged things.

Three rules that matter:

- **Never allocate in `pixel`.** It runs 4,608 times a frame — about four
  million times per export. Return packed integers, not objects or strings.
- **Loop seamlessly.** The wall replays the same `seconds` for hours, so the
  frame at `t = seconds` must be identical to the frame at `t = 0`. Derive every
  frequency from `seconds` rather than picking numbers that look nice.
- **Rows 0–11 and rows 12–23 are on opposite walls.** Nobody ever sees a shape
  spanning all 24 rows as one image. It is two 192 x 12 shows sharing a
  timeline: `y % 12` makes them identical, `y < 12` tells them apart.

`src/api/stargate.d.ts` is the whole API, and it is the single source of truth
for the editor's completions, the human docs, and the **Copy AI prompt** button
— which puts a complete authoring brief on the clipboard for any assistant.

Sixteen worked examples ship in the picker, from a four-line plasma to a
volumetric fractal. They double as the test suite.

## The preview

Two strips with a fixed screen-space gap, integer zoom only, nearest-neighbour.
A row gutter down the left reads in canvas coordinates 0–23 — the same `y` a
show is handed — and a column ruler along the bottom marks column 96, the
controller seam.

Panning is a scroll container. Note two deliberate departures from *Preview* in
DESIGN.md, both made at the bench: there is **no overview bar**, and the
horizontal **scrollbar sits above** the strips rather than below, as a second
scroll container synced to the real one. A rotate hack would have put a 3D
transform under the canvases, and resampled pixels are the one thing this
preview cannot afford.

## Export

**Export frames** renders every frame at exactly 192 x 24 on an offscreen canvas
— synthetic time, as fast as the machine goes, never the preview loop — and
downloads a zip of `frames/frame-00001.png` upwards. Frames are stored rather
than deflated (PNG is already compressed) and the zip is streamed into a Blob,
so peak memory stays flat however long the show is.

`.sho` generation is deliberately **not** in v1: it is blocked on the hardware
questions in *Risk gates* in DESIGN.md. Load the frames by hand in Show Designer
(New Effect → Animation → Group `All (front)` → Browse to `frames` → Load, then
fps 30, scale 1, smooth **off**). The seam where `.sho` slots in is one
`zip.add()` in `src/export/exportShow.ts`.

**The antiparallel reversal is stubbed, not solved.** The two runs are addressed
from opposite ends of the corridor, so one band's columns need reversing on
export — but which band is still unknown, and it needs the spike in `spike/` run
at the wall. `REVERSED_BAND` in `src/runtime/geometry.ts` is written and
defaulted to identity. Do not guess it; measure it.

## Layout

```
src/runtime/     compile a show, render one 192 x 24 frame, colours, geometry
src/preview/     the rAF playback loop (outside React) and the two-strip view
src/export/      synthetic-time bake and the streaming zip writer
src/editor/      CodeMirror 6, completions driven off stargate.d.ts
src/examples/    the gallery, and the picker that renders a live frame per row
src/api/         stargate.d.ts and the AI prompt built from it
scripts/         the headless check, plus a PNG codec and canvas shim for it
```

The render loop never goes through React. React owns the chrome; the frame
counter and scrubber are written straight to the DOM.

## The check

`npm test` bundles the real `src/` modules with esbuild, runs the exporter
against a headless canvas shim, unzips the result, and decodes the PNGs with an
independent decoder before asserting individual pixel values. It also proves
every bundled example compiles, renders, and **closes its loop exactly** —
frame 0 and frame N must be identical, byte for byte, with a deliberately
drifting show as the negative control.

It does not cover the browser's own PNG encoder or a real 2D context. Those are
exercised in the app.

## Credits

Three of the showpieces are adaptations of published work, cited in the source
of each example as well as here:

- **Hyperspace** — after [Star Nest](https://www.shadertoy.com/view/XlfGRj) by
  Kali (Pablo Roman Andrioli), MIT licensed.
- **Domain Warp** — Inigo Quilez's
  [domain warping](https://iquilezles.org/articles/warp/), and his Shadertoy
  [Warping - procedural 2](https://www.shadertoy.com/view/lsl3RH).
- **Ion Tunnel** — the analytic tunnel mapping, from Inigo Quilez's
  [tunnels article](https://iquilezles.org/articles/tunnel/).

The rest are original, and all of them are rewritten rather than ported: no
vectors, no allocation per pixel, and every one closes its loop exactly.

## One-time setup for GitHub Pages

Not automated, and not something the build can do for you:

1. **Create the GitHub remote and push.** The repo has none yet, so nothing in
   `.github/workflows/deploy.yml` runs until it does.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Pages on a private repo needs a paid plan.** If the repo stays private on a
   free account, publishing will fail and `npm run build:single` becomes the
   only distribution path — which is a fine place to be.

`base` in `vite.config.ts` is `/stargate/` to match the repository name. If the
repo is renamed, change it, or every asset 404s.
