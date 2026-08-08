# Design

Design decisions for the Stargate authoring tool. See [CLAUDE.md](CLAUDE.md) for the
hardware and show-format background, [RESOURCES.md](RESOURCES.md) for the resource index.

Status: **pre-implementation.** Two risk gates (below) are unresolved and either could
change the shape of this.

---

## What the tool is

A single-page web app, hosted on GitHub Pages. It runs shows written as JavaScript,
previews them on the real ceiling geometry, and exports a zip containing the `.sho` plus
the PNG frame sequence it references.

No server, no binary, no install, no accounts. A show is one file of code.

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
`show.toml`, and in v1 no assets at all — a show is one self-contained file of code, which
is what makes it trivial to copy, paste, share, and hand to an AI.

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

- **Write JS** in a **CodeMirror 6** pane, hot-reloading onto the preview
- **Drop assets** — images a script can load
- **Copy AI prompt** — puts the full authoring context on the clipboard (API reference,
  ceiling geometry, a worked example, the constraints). Paste into any assistant, get a
  show back, paste it into the editor.

The prompt button is how a non-programmer uses this. It replaces the folder-drop path
that earlier drafts treated as the friend's entry point.

**Why CodeMirror rather than a `<textarea>`.** The AI workflow means routinely pasting
large blobs of unfamiliar code, which is exactly where a textarea is worst — no
highlighting to sanity-check against, no folding, no structure. And the payoff is
**inline error markers**: when a generated show throws, the gutter points at the line.
esbuild is already in the build, so bundling `@codemirror/lang-javascript` plus basic
setup costs nothing but bytes (~100–130 KB gzipped), which matters only to the offline
single-file artifact and is acceptable there.

Show scripts are plain JS at runtime even though the app is TypeScript, so the JS
language mode is the right one.

**Type hints come from a hand-written `stargate.d.ts`** — the declarations for `pixel`,
`draw`, `rgb`, `hsl`, `load`, and `ctx`. That file is the single source of truth for
three consumers at once: editor completions and hover docs, the **Copy AI prompt**
payload, and the human documentation. A `.d.ts` is a compact and precise API description,
which is exactly what an LLM reads best — so the artifact that makes the editor helpful is
the same one that makes generated shows correct.

For v1, drive CodeMirror's completions from it directly. The API is ~10 symbols, which is
the size where a hand-written completion source with `info` strings wins outright.

Running a real TypeScript language service in the browser (`@typescript/vfs` plus the
compiler) would add inline diagnostics — catching `ctx.beginPath()` or a bare `sin()`
before you press play. It is the obvious upgrade, but it costs ~1.5–2 MB gzipped against
CodeMirror's ~100–130 KB, and the feedback loop here is already sub-second: hot reload
renders 4,608 pixels instantly and the gutter marks the throwing line. Defer it until the
API outgrows a hand-written list.

**Error handling pairs with this.** `pixel` runs 4,608 times a frame, so a throw must not
spam — catch the first, halt the render, mark the line, and leave the last good frame on
screen.

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

### `draw` — for discrete shapes

Where a shader is clumsy: hard edges you would rather place than derive.

```js
export function draw(ctx, t) {
  ctx.fillStyle = "#fff";
  ctx.fillRect((t * 40) % 192, 4, 8, 4);
}
```

`ctx` is a real `CanvasRenderingContext2D` on a 192x24 canvas, so the whole Canvas API is
present. The *documented* surface stays small — `fillStyle`, `globalAlpha`, `fillRect`,
`clearRect`, plus `ctx.band("right"|"left"|null)` to clip and `ctx.copy("right→left")` to
duplicate — because the prompt has to fit in a page. Anything continuous belongs in
`pixel`.

Without assets, `draw`'s original justification (blitting logos) is deferred to v2. It
stays in v1 anyway because it costs nothing — `ctx` is already a canvas — and because
`drawImage` then simply starts working when assets arrive.

Bands are named for the strips, not for screen position: "top" and "bottom" are an
artifact of how the preview stacks them and mean nothing in the room. `copy` is a straight
duplicate, **not** a mirror — the exporter applies the antiparallel reversal, so both
bands already share a physical direction inside the script's coordinate space.

### The prompt is the spec

The API reference, the editor's type hints, and the **Copy AI prompt** payload are all the
same artifact: `stargate.d.ts` plus a worked example. If the surface doesn't fit in ~100
lines of pasted context it is too big — an API an AI can't hold in one prompt is one it
will hallucinate against.

That constraint is doing real work: it is why `pixel` is one function rather than a
library, why `draw` documents a handful of calls even though the full Canvas API is
technically reachable, and why a hand-written completion source is currently enough.

## Sharing and persistence

A show is text, so sharing a show is sharing text. No accounts, no server, nothing to
upload.

- **`localStorage`** holds the current script, so a reload never loses work.
- **The URL carries the show** — the script compressed into the fragment, the way every JS
  playground does it. Sending someone a link sends them the show, running.
- **Copy/paste** is the universal path: it is just a file, and it round-trips through
  chat, email, and any AI assistant without ceremony.
- **Bundled examples** ship with the app as a starting gallery.

Export (below) is the only filesystem interaction in v1.

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
  Stargate/...`) — assuming the spike confirms relative paths don't work. A browser cannot
  learn a real filesystem path and cannot verify one, so this is the one exported value
  that can be silently wrong. It is a property of the LSC machine, not of a show, so it is
  configured once and kept in `localStorage`.

  Four things make that survivable, in order of how much they help:

  1. **Prefill the known root.** Every existing show lives under `G:/My Drive/Fuse Live
     Arts/Artwork/Stargate/Shows/`. Default to it and append the show name, so the zip
     extracts to `My Show/` there and the common case needs no configuration at all.
  2. **Read it from an existing `.sho`.** Dragging in `PacMan.sho` and parsing its
     `<animationdir>` is ~20 lines and takes the value from ground truth on the user's own
     machine. "Drop in a show that already works" is answerable by someone who could not
     answer "type your asset root".
  3. **Print the expected path** in the export dialog and in a README inside the zip.
     Verification is impossible, so the requirement has to be unmissable at the moment
     they extract.
  4. **Document the symptom.** A wrong path almost certainly plays black rather than
     erroring usefully.

Fixed by the animation contract, not configurable: `gid` 4999 (`All (front)`), `scale` 1,
`smooth` 0, `preload` 0, `xoffset`/`yoffset` 0, `transenabled` 0. `end` is derived —
937 frames ÷ 30 fps = 31233 ms, exactly what `PacMan.sho` carries.

### Always a zip

One download containing `Show.sho` and `frames/`. Extract it to `animationdir` on the LSC
box. No File System Access API, no directory handles, no permission prompts.

That choice removes the last Chromium-only dependency and the last thing that made hosting
load-bearing: with no secure-context requirement, the same bundle works from a `file://`
double-click, so an offline or air-gapped LSC machine is no longer a risk. GitHub Pages
stays the distribution default because deploys are a git push and nobody runs a stale
copy — but it is now a convenience, not a requirement.

### Size

Frames are PNG-compressed. A 192x24 frame is 13.8 KB raw; typical procedural content
compresses to ~1–4 KB, photographic-ish content to ~4–8 KB.

| Show | Frames @30fps | Zip (≈4 KB/frame) |
|---|---|---|
| PacMan (31 s) | 937 | ~4 MB |
| Warp Tunnel (126 s) | 3,800 | ~15 MB |
| 5 min | 9,000 | ~36 MB |
| 10 min | 18,000 | ~72 MB |

Real shows are 30 s to ~2 min, so the realistic answer is **4–20 MB — a non-issue.** Two
implementation choices keep it that way well past those sizes:

- **Store, don't deflate.** PNGs are already compressed; re-deflating them gains nothing
  and costs CPU and memory. Use level 0 for frames, and deflate only the tiny XML.
- **Stream the zip.** Encode one frame at a time, discard the pixel buffer, and feed
  fflate's streaming API, accumulating output chunks into a `Blob` rather than one giant
  `ArrayBuffer` — Blob backing spills to disk, a single typed array does not. Peak heap
  stays flat in show length instead of growing with it.

Both are barely more code than the naive version and together they remove the ceiling, so
there is no reason not to do them from the start.

## Deferred to v2

Cut from v1 to keep a show a single copy-pasteable file. Recorded so the reasoning does
not have to be rediscovered:

- **Image assets.** Would make a show a *folder* rather than a file — script plus its
  images — read via `showDirectoryPicker()` with the handle persisted in IndexedDB.
  `ctx.drawImage` already works, so this is mostly plumbing for `load()`.
- **Video.** Decode once at import, downscale to 192x24 immediately, hold frames in
  memory: 937 frames at 192x24 RGBA is ~17 MB, so a 173 MB source becomes a small array
  and `clip.at(t)` is an array lookup. WebCodecs for speed, seek-and-`drawImage` as
  fallback. Note this also answers the old `fit`/aspect question as ordinary code —
  `ctx.drawImage(clip.at(t), 0, 0, 192, 24)` — with no config key to get wrong.

Worth doing eventually: the existing art (`PacMan Logo.png`, `Ready!.png`, the chevrons)
and the OpenShot project in `resources/` are all asset-shaped, and that is the friend's
native workflow.

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

- When does `stargate.d.ts` outgrow a hand-written completion source and justify the
  TypeScript language service? Revisit if the API passes ~15 symbols.
- The chevron art is 52x24 drawn at `starty` 12 for *both* groups — one full-height shape
  each 12-row group clips in half, so a `>` puts `\` on one wall and `/` on the other.
  Worth knowing whether that was meant to read as depth from inside the corridor before
  deciding how much the two bands should relate.
- [RESOURCES.md](RESOURCES.md) gap 4 (corridor width) is no longer load-bearing. Gap 3
  (orientation) is half-answered: the runs are antiparallel; only the two absolute flips
  remain.
