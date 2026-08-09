# Stargate

Authoring pipeline for a 192 x 24 LED installation driven by a Color Kinetics LSM
Gen 5. It generates `.sho` show files and the baked PNG frame sequences they
reference. The LSM handles playback, scheduling, and keypad triggering.

Hardware: 1x LSM Gen 5, 1x Antumbra Ethernet Keypad, 4x sPDS-480ca, 128x iColor
Module FX 6:36 (36 nodes each).

## How shows are generated

`.sho` is UTF-16LE XML whose `gid` resolves against groups in the `.map`, so the LSM
is scriptable from outside.

Every generated show is **one `Meta Effect` containing one `Animation`**, pointing at
a directory of PNG frames. That gives direct control of all 4,608 pixels — all content
reduces to pixels — and makes preview exact, since the preview renders the same frames
the LSM will play.

`resources/Shows/PacMan.sho` is the template: 3.2 KB, exactly this structure.

### Animation contract

- `gid` **4999** (`All (front)`) for full-wall content.
- Author at exactly 192 x 24; emit `scale` 1, `smooth` 0. **Unverified** — `PacMan.sho`
  points at 1910 x 470 frames with `smooth` 1 against a 96 x 24 target region, so the
  LSM is doing a ~20x downscale internally in the one known-good case. Native-size
  passthrough has never been observed on this wall. Confirm early.
- Native is also the *convention-proof* size, which is why it stays the target
  regardless of how that test lands. The map's base grid unit is 12 and pixels sit two
  cells apart (see [Half-pitch](#half-pitch-the-grid-under-the-grid)), so a group can be
  measured two ways: **cell** (each pixel owns a cell, 192 x 24 units) or **centre**
  (first pixel centre to last, 191 x 23 units). 192 x 24 lands exactly on every LED
  under *both* — cell is 1:1, centre puts LED `i` at `i·191/191 = i`. Sizes like
  191 x 47 are exact under centre only. At native, `smooth` cannot matter either: every
  sample hits an integer. If native passthrough fails, the fallback is **383 x 47** (the
  full canvas at 2x half-pitch), not 384 x 48.
- `animationdir` and `imagefile` are absolute Windows paths (`G:/My Drive/Fuse Live
  Arts/Artwork/Stargate/...`). The emitter takes the asset root as config.
- `preload` is 0 in PacMan across ~937 frames. If the first pass stutters, try 1.

## Validate first

Confirm LSC imports a hand-written `.sho`. The backups are named
`LSE-Database-Export`, hinting that shows live in a database and `.sho` is an export
format. Hand-edit one value in `PacMan.sho`, load it, see if the change takes.

## Tooling

A **single-page web app** — client-side TypeScript, built with Vite into a static site plus
a single self-contained HTML file. No server, no binary, no install: a hosted URL, or a file you open.

A browser beats an `.exe` on "nothing to install" (every Windows box has Edge, and a URL
doesn't have to get past SmartScreen), it already has Canvas and a PNG encoder so most of
a native implementation would be reimplementation, and V8 makes per-pixel JS free. A
headless CLI stays available later without a rewrite — the same TS runs under Node.

**A show is a script.** One input format, a `.js` file carrying its own metadata:

```js
export const name = "Warp Tunnel", fps = 30, seconds = 31;

export function pixel(x, y, t) { ... }   // shader — fills the frame
export function draw(ctx, t)   { ... }   // imperative — composites on top
```

`pixel` is primary: 4,608 pixels is small enough that per-pixel JS is cheap, and
`(uv, time) → rgb` is both the smaller surface and the stronger AI prior for this kind of
content. `draw` handles sprites. Define either or both.

There is no PNG-directory input, no `show.toml`, and in v1 no assets — a show is one
self-contained file of code, easy to copy, paste, share, and hand to an AI. That deletes
the entire input-validation surface: frame size, count, and numbering cannot be wrong when
nothing outside the tool produces them. Images and video are deferred to v2.

Persistence is `localStorage` plus the script compressed into the URL fragment, so sending
a link sends a running show.

Non-programmers author via a **Copy AI prompt** button that hands any assistant the full
authoring context; the API reference and that prompt are the same document.

## Authoring flow

```
show.js  ─→  run  ─→  preview (two strips, zoom, pan, scrub)
                 ↓
             export  ─→  one zip: Show.sho + frames/  ─→  extract to G: on the LSC box
```

Export is **always a zip** — no File System Access API, so no Chromium requirement and no
secure context, which means the same bundle also works from a `file://` double-click if
the LSC box turns out to be offline. Pages stays the default because deploys are a git
push and nobody runs a stale copy, but it is a convenience, not a requirement.

Frames store uncompressed inside the zip (PNG is already compressed) and the zip is
streamed into a `Blob` rather than buffered, so peak memory is flat in show length. A
realistic 30 s–2 min show is 4–20 MB.

**The script is the source of truth.** The old pipeline hand-rendered four 937-frame
directories off one video and lost track of them: two are mislabeled (the dir named `10x`
holds 4x frames, `3x` holds 10x) and one has 936 frames instead of 937. The 191 x 47
master is *correct* — it is exactly `Front (center)` in half-pitch cells — but every
render taken off it is 1–9 px too large, because scaling in that space is `(n−1)k+1` and
whoever rendered them multiplied by `m` instead (see below). A script is reproducible by
construction; a rendered folder is a claim you have to trust.

**Preview fidelity is the product.** Show Designer's timeline already works; what it
can't show is that the canvas is two physically separate runs on opposite walls.

## Physical layout

Two strips along either side of the ceiling, each 192 x 12 (32 modules long, 2 wide).
The 192 x 24 canvas stacks them. Verified against the map:

| Strip | Rows | Controllers |
|---|---|---|
| Right | 0–11 | `CTRL-A` (cols 0–95) + `CTRL-B` (cols 96–191) |
| Left | 12–23 | `CTRL-C` (cols 0–95) + `CTRL-D` (cols 96–191) |

Each port drives one 6 x 12 cross-section, so port boundaries run crosswise.

The strips are on **opposite sides of the room**, so content spanning all 24 rows is
never seen as one image — a shape across rows 10–13 has its halves on opposite walls.
The 192 x 24 canvas is a transport container for two independent 192 x 12 shows sharing
a timeline. The current map does *not* mark the boundary — `Stargate v3 - Pacman.map` is a
uniform 24-unit lattice in both axes. (`Stargate v2` put a 120-unit gap between rows 11
and 12; v3 dropped it.) The split rests on the controller quadrants, the `Row R*`/`Row L*`
group names, and the antiparallel scroll below — not on map geometry.

### Half-pitch: the grid under the grid

The map's base grid unit is **12**, and every pixel sits at an *odd* multiple of it:
`x/12` = 5, 7, … 387 (192 values) and `y/12` = 7, 9, … 53 (24 values). So on the native
grid the LEDs occupy odd cells with an empty cell between each — `Old/LightJoy.map` is
laid out at pitch 12 directly, so the unit is real. Regions in half-pitch cells:

| Region | Pixels | Half-pitch cells |
|---|---|---|
| `All (front)` | 192 x 24 | 383 x 47 |
| `Front (center)` | 96 x 24 | **191 x 47** |
| One strip | 192 x 12 | 383 x 23 |

This is where the legacy art sizes come from, and they are not mistakes: the PacMan
master is 191 x 47, `Warning Sign 24x24.png` is 26 x **23** (one strip), and
`Animation Template.png` is 765 x 93 = the full canvas at 4x — `(192−1)·4+1` by
`(24−1)·4+1`. That last one is generated by **Management Tool**, so the vendor's own
tooling works in this space.

**The scaling rule is `(n−1)k+1`, not `n·k`.** Multiplying the 191 x 47 master by `m`
gives 191m x 47m where the exact size is 190m+1 x 46m+1 — every render is `m−1` px too
big, drifting from 0 at the top-left to ~half an LED at the bottom-right:

| Render | Actual | Exact |
|---|---|---|
| 3x | 573 x 141 | 571 x 139 |
| 4x | 764 x 188 | 761 x 185 |
| 10x | 1910 x 470 | 1901 x 461 |

That predicts a *sharpness gradient* across the wall, and it is the likely origin of the
sharpness settings the old pipeline kept fiddling with. Rendering above native was the
deeper mistake either way: the LSM reduces to the pixel count regardless, so an upscale
plus its downscale is two lossy resamples where zero were needed.

**The two runs are antiparallel.** `Warp Tunnel.sho` scrolls the Right strip 191 → −191
and the Left strip −167 → 215 — opposite canvas directions — with `(rev)` art on the
Left that is a *horizontal* mirror. Since the chevrons move the same direction in the
room, the runs must be addressed from opposite ends of the corridor. That is what
`(rev)` compensates for; it is not corridor-axis symmetry. **The emitter owns this
reversal**, so authors draw one physical coordinate space and never mirror an asset.

## Groups

`gid` is the decimal value of a group's hex `<s>` in the `.map`.

| Group | gid | Region |
|---|---|---|
| `All (front)` | 4999 | rows 0–23, cols 0–191 — **default for new work** |
| `Right (front)` | 2596 | rows 0–11 |
| `Left (front)` | 5001 | rows 12–23 |
| `Front (center)` | 2410 | rows 0–23, cols 0–95 (PacMan uses this) |
| `Back (center)` | 2603 | rows 0–23, cols 96–191 |
| `Row R1`…`R12` | 1966…2373 | single rows 0–11 |
| `Row L1`…`L12` | 2447…2606 | single rows 12–23 |

Since we bake frames, groups are a compile-time convenience — a named region to draw
into. Default to `All (front)` and composite layers in our own code.

## Scale

4,608 pixels at 30 fps. One frame is 13.8 KB; a 31 s show is ~13 MB raw, so whole
shows fit in RAM — render eagerly.

See [DESIGN.md](DESIGN.md) for the tool's design decisions and their rationale, and
[RESOURCES.md](RESOURCES.md) for the `resources/` index: vendor docs, the fixture map,
`.sho`/`.map` formats, and show assets.
