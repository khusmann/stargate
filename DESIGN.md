# Design

Design decisions for the Stargate authoring tool. See [CLAUDE.md](CLAUDE.md) for the
hardware and show-format background, [RESOURCES.md](RESOURCES.md) for the resource index.

Status: **pre-implementation.** Two risk gates (below) are unresolved and either could
change the shape of this.

---

## What the tool is

A single-page web app, hosted on GitHub Pages. It runs shows written as JavaScript,
previews them on the real ceiling geometry, and exports the `.sho` plus the PNG frame
sequence it references.

No server, no binary, no install — open the URL on the LSC box and export straight to `G:`.

## Decisions

### A show is a script

There is exactly one input format: a `.js` file. It carries its own metadata, draws its
own frames, and is the thing you edit, commit, email, and hand to an AI.

```js
export const name    = "Warp Tunnel";
export const fps     = 30;
export const seconds = 31;

export function pixel(x, y, t) { ... }
```

Everything downstream is generated. There is no PNG-directory input format, no
`show.toml`, and no separate path for non-programmers — a dropped folder of images is an
*asset* a script loads, not an alternate way in.

This deletes the entire input-validation surface. Frame size, count, numbering, and
zero-padding cannot be wrong, because nothing outside the tool produces them. The canvas
is 192x24 by construction.

It also fixes the failure the old pipeline actually had. Four PacMan frame directories
were hand-rendered off one video and immediately lost track of: two are mislabeled (the
dir named `10x` holds 4x frames, `3x` holds 10x), one has 936 frames where the others
have 937, and every master is 191x47 where its target region (`Front (center)`, 96x24)
wanted an exact multiple — 192x48. Nobody could say which directory was which, and the
quality problem they chased with sharpness settings was an off-by-one. A script is
reproducible by construction; a rendered folder is a claim you have to trust.

### Client-side TypeScript

The earlier plan was a Go binary embedding a JS interpreter. The arguments for it have
since expired:

- **Video ingest is gone** — it was the main reason to want a native process (`ffmpeg`).
- **A browser beats an `.exe` on "nothing to install."** Every Windows box has Edge
  already, and a URL doesn't have to get past SmartScreen.
- **Most of the remaining Go work was reimplementation** — a Canvas 2D subset and a PNG
  encoder, both of which the browser already has.
- **Per-pixel performance stops being a bet.** Under goja, 4.3M calls per bake was the
  load-bearing unknown of the whole design. V8 does it in well under a second.

It also dissolves a constraint the old design worked around. "Preview replays the baked
frames" existed to guarantee preview and build agreed; client-side they are the same code
path by construction.

TypeScript costs a bundler — one `esbuild` command to inline everything into a single
HTML file. Worth it on a project where much of the code will be AI-written, since types
catch most of what goes wrong there.

**A headless CLI stays available later** without a rewrite: the same TS runs under
Node/Deno/Bun behind a thin command. Go had the opposite property — a Go renderer can
never run in the browser.

### The UI is an editor and a drop target

- **Write JS** in an editor pane, hot-reloading onto the preview
- **Drop assets** — images a script can load
- **Copy AI prompt** — puts the full authoring context on the clipboard (API reference,
  ceiling geometry, a worked example, the constraints). Paste into any assistant, get a
  show back, paste it into the editor.

The prompt button is how a non-programmer uses this. It replaces the folder-drop path
that earlier drafts treated as the friend's entry point.

## The JS API

Two entry points. A show defines either or both:

```js
export function pixel(x, y, t) { ... }   // shader — fills the frame
export function draw(ctx, t)   { ... }   // imperative — composites on top
```

If both are defined, `pixel` runs first and `draw` composites over the result — the
common shape for a real show is a procedural background with a logo on it.

### `pixel` — the primary API

One pure function per pixel, fragment-shader style. Returns a packed 24-bit color.

```js
export function pixel(x, y, t) {
  const wave = Math.sin(x * 0.05 - t * 3) * 0.5 + 0.5;
  return hsl((x * 2 + t * 60) % 360, 1, wave * 0.5);
}
```

`x` is 0–191, `y` is 0–23, `t` is seconds. Return `rgb(r,g,b)` (0–255), `hsl(h,s,l)`
(h 0–360, s/l 0–1), or a bare `0xRRGGBB`. Packed integers rather than strings or arrays —
at millions of calls per bake, a per-pixel allocation is the one thing that would hurt.

Bands need no API here. `y < 12` is the Right strip, `y >= 12` is the Left, and making
both walls identical is one line:

```js
export function pixel(x, y, t) { return band(x, y % 12, t); }
```

**Why this is primary.** 4,608 pixels is small enough that per-pixel JS is free. And for
the content this wall wants — plasmas, waves, tunnels, colour cycling on a 16:1 strip —
the Shadertoy corpus is enormous and is exactly `(uv, time) → rgb`, so it is both the
stronger AI prior and the smaller surface: one signature, no state machine, no draw order.

### `draw` — for sprites and discrete shapes

Where a shader is clumsy: blitting image assets, and anything with hard edges you would
rather place than derive.

```js
const logo = await load("PacMan Logo.png");

export function draw(ctx, t) {
  ctx.drawImage(logo, (t * 40) % 192, 0);
}
```

`ctx` is a real `CanvasRenderingContext2D` on a 192x24 canvas, so the whole Canvas API is
present. The *documented* surface stays small — `fillStyle`, `globalAlpha`, `fillRect`,
`clearRect`, `drawImage`, plus `ctx.band("right"|"left"|null)` to clip and
`ctx.copy("right→left")` to duplicate — because the prompt has to fit in a page. Anything
continuous belongs in `pixel`.

Bands are named for the strips, not for screen position: "top" and "bottom" are an
artifact of how the preview stacks them and mean nothing in the room. `copy` is a straight
duplicate, **not** a mirror — the exporter applies the antiparallel reversal, so both
bands already share a physical direction inside the script's coordinate space.

### The prompt is the spec

The API reference and the **Copy AI prompt** payload are the same document. If the surface
doesn't fit in ~100 lines of pasted context it is too big — an API an AI can't hold in one
prompt is one it will hallucinate against.

That constraint is doing real work: it is why `pixel` is one function rather than a
library, and why `draw` documents a handful of calls even though the full Canvas API is
technically reachable.

## Preview

Two strips, drawn as two bars with real space between them:

```
┌──────────────────────────────────────┐
│  rows 0–11    Right (front)          │   192 x 12
└──────────────────────────────────────┘

              (corridor gap)

┌──────────────────────────────────────┐
│  rows 12–23   Left (front)           │   192 x 12
└──────────────────────────────────────┘
```

That single change is most of why the tool exists. Show Designer's timeline already works;
what it cannot show is that the 192x24 canvas is a *logical* stack of two physically
separate runs.

The gap is **fixed and deliberately large** — not adjustable. The strips are on opposite
sides of the room, so no width is "correct" and tuning one implies a precision that does
not exist. It only has to say *different wall*.

No perspective, no camera, no 3D.

### The canvas is 16:1, so the viewport is the design problem

Each strip is 192x12. Zoomed far enough to see anything it is far wider than the window,
so panning is the primary interaction, not an afterthought.

- **Integer zoom only**, nearest-neighbour. A preview pixel is always a whole number of
  screen pixels; fractional zoom would make some pixels 10px wide and some 11px. Default
  is the largest multiple that fits the window width (8x in a 1600px window).
- **Horizontal pan, locked between strips.** They share a column index, and comparing
  column N across the two walls is most of why you would zoom in.
- **The gap is screen-space, not canvas-space** — constant as you zoom, so both strips
  stay visible and vertical scrolling never becomes necessary.
- **Overview bar** — the full 192 at 1x with a viewport rectangle. At 16:1 you lose your
  place instantly, and at 1x the whole canvas is 192px wide, so it costs nothing.
- **Column ruler**, with column 96 marked — the controller boundary, the one seam that
  could show real artifacts.
- Transport: play/pause, scrub, frame step, loop.

### These are two shows, not one

The strips face each other across a room, so **nobody ever sees content spanning all 24
rows as one image.** A shape drawn across rows 10–13 has its top half on one wall and its
bottom half on the other. The 192x24 canvas is a transport container for two independent
192x12 shows that share a timeline.

Near-symmetry between the walls is the one relationship a person can actually perceive, so
making it easy is the point: `y % 12` in `pixel`, or `ctx.copy()` in `draw`.

### The runs are antiparallel

Established from `Warp Tunnel.sho` plus one observation — chevrons move the *same*
direction in the room:

| | Right (gid 2596, rows 0–11) | Left (gid 5001, rows 12–23) |
|---|---|---|
| Art | `N Chevron.png` | `N Chevron (rev).png` |
| Scroll x | 191 → −191 (decreasing) | −167 → 215 (increasing) |
| Timing | `Rotate 1`–`8` | `Rotate 1R`–`8R`, identical begin/end |

The strips scroll in **opposite canvas directions** yet move the **same way in the room**,
so the runs are addressed from opposite ends of the corridor. `(rev)` is a horizontal
mirror — verified by diffing the PNGs; the art is vertically symmetric, so a vertical flip
would be a no-op — exactly the compensation an arrow needs on a backwards-addressed run.
Two independent compensations, one cause.

This reading depends on the observation being of the installation, not of Show Designer's
canvas, where the two visibly oppose.

**Still open, and both are global one-parameter flips rather than subtle bugs:** which
physical wall is the Right strip, and which end of the corridor is column 0.

### So the exporter owns the reversal

The old pipeline compensated for antiparallel wiring **in the content** — mirrored art
files and reversed scroll directions, hand-authored per effect. That is the entire reason
`(rev)` exists.

Instead: **the canvas is physical.** A script draws one coordinate space where +x is one
consistent physical direction down the corridor, and the exporter reverses column order
for the antiparallel band when baking. Motion authored once moves the same way on both
walls, with no mirrored assets and no per-effect compensation.

## Export

Output is a `.sho` plus a directory of PNG frames.

- **PNG frames** — `canvas.toBlob()` per frame, named `frame-%05d.png`, 1-based, matching
  the export convention already in use.
- **`.sho`** — UTF-16LE with BOM and CRLF (see [RESOURCES.md](RESOURCES.md)). One
  `Meta Effect` containing one `Animation`.
- **`animationdir`** is an absolute Windows path (`G:/My Drive/Fuse Live Arts/Artwork/
  Stargate/...`). It is a property of the LSC machine, not of a show — set once in the UI
  and remembered in `localStorage`.

Fixed by the animation contract, not configurable: `gid` 4999 (`All (front)`), `scale` 1,
`smooth` 0, `preload` 0, `xoffset`/`yoffset` 0, `transenabled` 0. `end` is derived —
937 frames ÷ 30 fps = 31233 ms, exactly what `PacMan.sho` carries.

### Getting it onto disk

**Hosted on GitHub Pages.** https is a secure context, so the **File System Access API**
works: `showDirectoryPicker()`, then a handle per file, writing straight to `G:`.
Chromium-only, which is fine on a Windows box with Edge. This is the reason to host rather
than ship a file — from a `file://` origin the directory picker is unavailable, and export
would degrade to a zip the user has to extract and move.

Hosting pays for itself twice over: deploying is a git push, and there is no version drift
between two people running different copies.

- **Zip download** — fallback for non-Chromium browsers and for the offline case. Needs a
  small zip lib (fflate, ~8 KB) inlined. ~13 MB raw for a 31 s show, less compressed.
- **Offline.** Pages needs the LSC box online at least once. If it turns out to be
  air-gapped, the same bundle is also a single-file release artifact — same code, zip
  export only. Worth confirming the machine has internet before relying on the hosted
  path.

## Risk gates

Both are unresolved, both are cheap, neither should wait.

**1. Does LSC import a hand-written `.sho`?** The backups are named
`LSE-Database-Export`, which hints shows live in a database and `.sho` is an export
format. Hand-edit one value in `PacMan.sho`, load it, see if the change takes. If `.sho`
is import-only-in-theory, the whole tool changes shape.

**2. Does `smooth 0` at native size pass pixels through 1:1?** In the one known-good case
the LSM is doing a ~20x downscale internally — `PacMan.sho` points at 1910x470 frames with
`smooth 1` against a 96x24 target region. Native-size passthrough has never been observed
on this wall.

## Open questions

- **Video as an asset?** Video was cut because it meant an `ffmpeg` dependency. In a
  browser that reason is gone — a `<video>` element plus `drawImage` extracts frames for
  free. As an *asset* rather than an input format it adds no config surface, since scaling
  becomes ordinary code (`ctx.drawImage(clip.at(t), 0, 0, 192, 24)`). Your friend's
  workflow is video-based; there is an OpenShot project in `resources/`.
- **Is the LSC machine online?** The hosted path needs it once. If not, fall back to the
  single-file release artifact and zip export.
- Editor pane: CodeMirror, or a `<textarea>` with error output? Probably the textarea
  first.
- The chevron art is 52x24 drawn at `starty` 12 for *both* groups — one full-height shape
  each 12-row group clips in half, so a `>` puts `\` on one wall and `/` on the other.
  Worth knowing whether that was meant to read as depth from inside the corridor before
  deciding how much the two bands should relate.
- [RESOURCES.md](RESOURCES.md) gap 4 (corridor width) is no longer load-bearing. Gap 3
  (orientation) is half-answered: the runs are antiparallel; only the two absolute flips
  remain.
