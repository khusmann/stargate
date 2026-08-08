# Design

Design decisions for the Stargate authoring tool. See [CLAUDE.md](CLAUDE.md) for the
hardware and show-format background, [RESOURCES.md](RESOURCES.md) for the resource
index.

Status: **pre-implementation.** Two risk gates (below) are unresolved and either could
change the shape of this.

---

## What the tool is

One Go binary that turns frames into a `.sho` plus the PNG sequence it references, and
previews the result on the real ceiling geometry.

```
stargate build   [show.toml | dir | show.js]   # headless, scriptable
stargate preview [show.toml | dir | show.js]   # localhost server + browser
stargate                                       # no args: open the UI
```

The last form matters. The deliverable is one `.exe` on the LSC machine and a
non-programmer is a first-class user — double-clicking it opens the browser UI, because
that user has no argv.

## Decisions

### Everything bakes to PNG frames

One `Meta Effect` containing one `Animation` pointing at a frame directory. All content
reduces to pixels, so preview is exact — the browser plays back the same frames the LSM
will play, not a reimplementation of them.

This is what keeps the browser UI honest and it's why there is no second renderer to
keep in sync.

### Input is 192x24 PNGs. Nothing else.

No video ingest, no resampling, no grading, no fit modes. Frames are exactly 192x24 or
the build fails.

The existing PacMan assets are the argument. Four frame directories were hand-rendered
off one source video, and:

- the folder names are wrong — the dir labeled `10x` holds 4x frames, the dir labeled
  `3x` holds 10x frames
- one dir has 936 frames where the others have 937
- every master is **191 x 47**, where the target region wants an exact multiple. PacMan
  targets `gid` 2410 = `Front (center)` = 96 x 24, so the master should have been
  192 x 48. Off by one pixel in each axis, so every render was a fractional downscale —
  and the LSM then did the final ~20x reduction itself with `smooth` 1.

Nobody could tell which directory was which, and the one quality problem they were
chasing with sharpness settings was an off-by-one in the master. Requiring native size
makes the resampling question disappear instead of giving people knobs to tune it with.
Resizing belongs in the editor that produced the frames.

Consequences: no `ffmpeg` dependency (the one thing a non-programmer would have had to
install and put on `PATH`), and no `golang.org/x/image/draw` either, since nothing ever
resamples. **Pure stdlib, zero cgo.** `GOOS=windows GOARCH=amd64 go build` and hand over
the file.

ffmpeg stays as documentation rather than a dependency — the size error prints the
escape hatch:

```
ffmpeg -i clip.mp4 -vf scale=192:24 frames/frame-%05d.png
```

### Procedural shows are embedded JavaScript

[goja](https://github.com/dop251/goja) — pure Go, no cgo, cross-compiles clean. Shows are
scripts, not compiled programs, so they hot-reload in the preview loop and the same
binary serves both authoring paths.

JS specifically, over Starlark or Lua, for one reason that turned out to be the deciding
one: **an AI can write it.** Both authors benefit, and the non-programmer benefits most.

### The UI is a drop target *and* an editor

Two panes, one window:

- **drop a folder** of 192x24 PNGs → validate, preview, export
- **write JS** in an editor pane → hot-reload onto the same canvas

Plus a **Copy AI prompt** button that puts the full authoring context on the clipboard —
API reference, ceiling geometry, a worked example, the hard constraints. Paste into any
assistant, get back a `show.js`, drop it in the editor.

## Preview

Flat only. The two strips drawn as two separate bars with real space between them:

```
┌──────────────────────────────────────┐
│  rows 0–11    Right (front)          │   192 x 12
└──────────────────────────────────────┘

              (corridor gap)

┌──────────────────────────────────────┐
│  rows 12–23   Left (front)           │   192 x 12
└──────────────────────────────────────┘
```

That single change is the whole point of the tool. Show Designer's timeline already
works; what it cannot show is that the 192x24 canvas is a *logical* stack of two
physically separate runs.

The gap is **fixed and deliberately large** — not adjustable. The strips are on opposite
sides of the room, so no width is "correct" and tuning one implies a precision that
doesn't exist. It only has to say *different wall*. The author sees the rest.

No perspective, no camera, no 3D. Exact pixels, scrub, and step.

### The canvas is 16:1, so the viewport is the design problem

Each strip is 192x12. Zoomed far enough to see anything, it is far wider than the window,
so panning is the primary interaction, not an afterthought.

- **Integer zoom only** — nearest-neighbor, whole multiples. A preview pixel is always a
  whole number of screen pixels; fractional zoom would make some pixels 10px wide and
  some 11px, which is the same class of lie the pipeline exists to eliminate. Default is
  the largest multiple that fits the window width (8x in a 1600px window), so the view
  starts honest and full-width.
- **Horizontal pan, locked between strips.** Drag, shift-wheel, or arrow keys. Both
  strips always scroll **together** — they share a column index, and being able to
  compare column N across the two walls is most of why you'd zoom in at all.
- **The gap is screen-space, not canvas-space.** It stays a constant number of screen
  pixels as you zoom, so both strips remain visible at every zoom level and vertical
  scrolling never becomes necessary.
- **Overview bar** — the full 192 at 1x with a viewport rectangle, always visible.
  At 16:1 you lose your place instantly otherwise, and at 1x the whole thing is 192px
  wide, so it costs nothing.
- **Column ruler**, with column 96 marked — that's the controller boundary
  (`CTRL-A`/`CTRL-C` below it, `CTRL-B`/`CTRL-D` above), the one seam that could
  show real artifacts.
- Transport: play/pause, scrub, frame step, loop.

### Consequence: these are two shows, not one

If the strips face each other across a room, **nobody ever sees content spanning all 24
rows as one image.** A shape drawn across rows 10–13 has its top half on one wall and its
bottom half on the other, separated by the width of the room. The 192x24 canvas is a
transport container for two independent 192x12 shows that share a timeline.

So near-symmetry between the two walls is the one relationship a person can actually
perceive, and making it easy is the point: `y % 12` in `pixel`, or `ctx.copy()` in `draw`.

### Strip orientation: the runs are antiparallel

Established from `Warp Tunnel.sho` plus one observation (chevrons move the *same*
direction in the room):

| | Right (gid 2596, rows 0–11) | Left (gid 5001, rows 12–23) |
|---|---|---|
| Art | `N Chevron.png` | `N Chevron (rev).png` |
| Scroll x | 191 → −191 (decreasing) | −167 → 215 (increasing) |
| Timing | `Rotate 1`–`8` | `Rotate 1R`–`8R`, identical begin/end |

The two strips scroll in **opposite canvas directions** yet move the **same way in the
room**, so the runs must be addressed from opposite ends of the corridor. `(rev)` is a
horizontal mirror — verified by diffing the PNGs; the art is vertically symmetric, so a
vertical flip would be a no-op — which is exactly the compensation an arrow needs on a
backwards-addressed run. Two independent compensations, one cause.

Note this reading depends on the observation being of the installation, not of Show
Designer's canvas, where the two visibly oppose.

**Still open, and both are global one-parameter flips rather than subtle bugs:** which
physical wall is the Right strip, and which end of the corridor is column 0. The
light-one-module test settles them.

### So the emitter owns the reversal

The old pipeline compensated for antiparallel wiring **in the content** — mirrored art
files and reversed scroll directions, hand-authored per effect. That is the entire reason
`(rev)` exists.

Instead: **the canvas is physical.** An author draws one coordinate space where +x is one
consistent physical direction down the corridor. When baking frames the emitter reverses
column order for the antiparallel band. Motion authored once moves the same way on both
walls, with no mirrored assets and no per-effect compensation.

This is the clearest case yet of the tool absorbing something the old workflow did by
hand and got wrong four times.

## The JS API

Two entry points. A show defines either or both:

```js
// show.js
const fps = 30;
const seconds = 10;

function pixel(x, y, t) { ... }   // shader — fills the frame
function draw(ctx, t)   { ... }   // imperative — composites on top
```

If both are defined, `pixel` runs first and `draw` composites over the result. That
layering is the common shape for a real show: a procedural background with a logo on it.

### `pixel` — the primary API

One pure function per pixel, fragment-shader style. Return a packed 24-bit color.

```js
function pixel(x, y, t) {
  const wave = Math.sin(x * 0.05 - t * 3) * 0.5 + 0.5;
  return hsl((x * 2 + t * 60) % 360, 1, wave * 0.5);
}
```

`x` is 0–191, `y` is 0–23, `t` is seconds. Return `rgb(r,g,b)` (0–255), `hsl(h,s,l)`
(h 0–360, s/l 0–1), or a bare `0xRRGGBB` literal. Packed integers, not strings or arrays —
at 4.3M calls per bake, a per-pixel allocation is the one thing that would actually hurt.

Bands need no API here. `y < 12` is the Right strip and `y >= 12` is the Left, and making
both walls identical is one line:

```js
function pixel(x, y, t) { return band(x, y % 12, t); }
```

**Why this is primary.** 4,608 pixels is small enough that per-pixel JS is affordable —
absurd at 1080p, unremarkable here. And for the content this wall wants (plasmas, waves,
tunnels, color cycling on a 16:1 strip) the Shadertoy corpus is enormous and is exactly
`(uv, time) → rgb`, so it is the stronger AI prior *and* the smaller surface: one
signature, no state machine, no draw order.

### `draw` — for sprites and discrete shapes

Where a shader is clumsy: blitting the existing image assets (`PacMan Logo.png`,
`Ready!.png`, the chevrons), and anything with hard edges you'd rather place than derive.

```js
const logo = load("PacMan Logo.png");

function draw(ctx, t) {
  ctx.drawImage(logo, (t * 40) % 192, 0);
}
```

**Surface** — state: `fillStyle`, `globalAlpha`. Ops: `fillRect`, `clearRect`,
`drawImage(img, x, y)`. Bands: `ctx.band("right"|"left"|null)` to clip,
`ctx.copy("right→left")` to duplicate. Constants: `ctx.width` (192), `ctx.height` (24).

Bands are named for the strips, not for screen position — "top" and "bottom" are an
artifact of how the preview stacks them and mean nothing in the room. `copy` is a straight
duplicate, **not** a mirror: the emitter applies the antiparallel reversal, so both bands
already share a physical direction inside the JS coordinate space.

**Deliberately excluded:** paths, beziers, `arc`, text, gradients, transforms. Gradients
and anything continuous belong in `pixel`; the rest mostly doesn't survive a 12-row band.

### The prompt is the spec

The API reference and the **Copy AI prompt** payload are the same document. If the surface
doesn't fit in ~100 lines of pasted context, it's too big — an API an AI can't hold in one
prompt is one it will hallucinate against.

That constraint is doing real work: it is why `pixel` is one function rather than a
library, why `draw` stays this small now that `pixel` carries everything continuous, and
it should be the tiebreaker on every future addition.

## Config

`show.toml` is **optional**. Everything has a default, so a bare directory builds.

```toml
name = "PacMan — Losing Match"      # default: directory name
source = "assets/pacman-frames/"    # default: the CLI argument
fps = 30                            # default: 30
```

It exists for naming and reproducibility, not configuration. The UI writes one on export
so a rebuild six months later is reproducible — the old pipeline encoded its parameters
in folder names, and that's how they got lost.

Not in `show.toml`: `animationdir`. The `G:/My Drive/Fuse Live Arts/...` asset root is a
property of the LSC machine, not of a show. It lives in a `stargate.toml` beside the exe,
set once.

Not configurable at all: `gid` 4999 (`All (front)`), `scale` 1, `smooth` 0, `preload` 0,
`xoffset`/`yoffset` 0, `transenabled` 0. Those are the animation contract. `end` is
derived — 937 frames ÷ 30 fps = 31233 ms, which is exactly what PacMan.sho carries.

## Validation

With ingest gone, the input contract *is* the tool's job:

- every frame exactly 192x24
- consistent zero-padding (otherwise frame 10 sorts before frame 2)
- contiguous numbering, no gaps — already silently happened once, in the 936-frame dir

Errors name the file and the fix:

```
error: frames are 1910x470 (4.06:1); target is 192x24 (8:1)
       content will be squashed 2.0x vertically
       frame 0517 is 1910x469 — inconsistent
```

Input frames follow the editor export convention already in use
(`PacMan - Losing Match-00001.png`, 1-based, zero-padded to 5). Output frames are
emitted the same way.

## Risk gates

Both are unresolved and both are cheap. Neither should wait.

**1. Does LSC import a hand-written `.sho`?** The backups are named
`LSE-Database-Export`, which hints shows live in a database and `.sho` is an export
format. Hand-edit one value in `PacMan.sho`, load it, see if the change takes. If `.sho`
is import-only-in-theory, the whole tool changes shape.

**2. Does `smooth 0` at native size pass pixels through 1:1?** The one known-good case is
worse than "the LSM resamples cleanly" — `PacMan.sho` points at 1910x470 frames with
`smooth 1` against a 96 x 24 target region, so the LSM has been doing a ~20x downscale
internally. Native-size passthrough has never been observed on this wall.

## Open questions

- **Benchmark goja on a per-pixel callback before building `pixel`.** The shader API rests
  on one unverified number: 4,608 px x 937 frames = 4.3M calls per bake, and ~138K
  calls/sec to hold 30 fps live. Both should be comfortable for a tree-walking interpreter
  at this size, but the whole design leans on it. An afternoon's measurement. If it comes
  in slow, the fallbacks are a coarser `pixel` grid for live preview only, or moving the
  hot path into Go.
- Does the editor pane need a real code editor (CodeMirror, embedded) or is a `<textarea>`
  with error output enough for v1? Probably the textarea.
- [RESOURCES.md](RESOURCES.md) gap 4 (corridor width) is no longer load-bearing — the
  preview's gap is a fixed visual separator. Gap 3 (orientation) is now half-answered: the
  runs are antiparallel; only the two absolute flips remain.
- The chevron art is 52x24 drawn at `starty` 12 for *both* groups — one full-height shape
  each 12-row group clips in half, so a `>` puts `\` on one wall and `/` on the other.
  Worth knowing whether that was intended to read as depth from inside the corridor before
  deciding how much the two bands should relate.
