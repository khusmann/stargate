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
- `animationdir` and `imagefile` are absolute Windows paths (`G:/My Drive/Fuse Live
  Arts/Artwork/Stargate/...`). The emitter takes the asset root as config.
- `preload` is 0 in PacMan across ~937 frames. If the first pass stutters, try 1.

## Validate first

Confirm LSC imports a hand-written `.sho`. The backups are named
`LSE-Database-Export`, hinting that shows live in a database and `.sho` is an export
format. Hand-edit one value in `PacMan.sho`, load it, see if the change takes.

## Tooling

A **single-page web app** — client-side TypeScript, bundled by one `esbuild` command into
one HTML file. No server, no binary, no install: a hosted URL, or a file you open.

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

There is no PNG-directory input and no `show.toml` — images and video are *assets* a
script loads, not an alternate way in. That deletes the entire input-validation surface:
frame size, count, and numbering cannot be wrong when nothing outside the tool produces
them.

A **project is a folder** on disk, opened once with `showDirectoryPicker()` and remembered
in IndexedDB: `show.js` plus its assets in, `frames/` and `Show.sho` out. `load()` resolves
against it. Video decodes once at import, downscaled to 192 x 24 and held in memory — 937
frames is ~17 MB — so `clip.at(t)` is an array lookup and preview stays instant.

Non-programmers author via a **Copy AI prompt** button that hands any assistant the full
authoring context; the API reference and that prompt are the same document.

## Authoring flow

```
show.js  ─→  run  ─→  preview (two strips, zoom, pan, scrub)
                 ↓
             export  ─→  Show.sho + frames/  ─→  straight to G: on the LSC box
```

Open the Pages URL on the LSC machine and export with the File System Access API — https
is a secure context, so `showDirectoryPicker()` works and frames land directly in
`G:/My Drive/...`. Zip download is the fallback for non-Chromium browsers. Hosting also
means deploys are a git push and nobody runs a stale copy.

**The script is the source of truth.** The old pipeline hand-rendered four 937-frame
directories off one video and lost track of them: two are mislabeled (the dir named `10x`
holds 4x frames, `3x` holds 10x) and one has 936 frames instead of 937. Every master is
191 x 47 where its target region (`Front (center)`, 96 x 24) wanted an exact multiple —
192 x 48 — so every render was a fractional downscale, with the LSM doing the final ~20x
reduction itself at `smooth` 1. The quality problem they chased with sharpness settings
was an off-by-one. A script is reproducible by construction; a rendered folder is a claim
you have to trust.

**Preview fidelity is the product.** Show Designer's timeline already works; what it
can't show is that the canvas is two physically separate runs on opposite walls.

## Physical layout

Two strips along either side of the ceiling, each 192 x 12 (32 modules long, 2 wide).
The 192 x 24 canvas stacks them. Verified against the map:

| Strip | Rows | Controllers |
|---|---|---|
| Right | 0–11 | `CTRL-A` (.123, cols 0–95) + `CTRL-B` (.135, cols 96–191) |
| Left | 12–23 | `CTRL-C` (.117, cols 0–95) + `CTRL-D` (.81, cols 96–191) |

Each port drives one 6 x 12 cross-section, so port boundaries run crosswise.

The strips are on **opposite sides of the room**, so content spanning all 24 rows is
never seen as one image — a shape across rows 10–13 has its halves on opposite walls.
The 192 x 24 canvas is a transport container for two independent 192 x 12 shows sharing
a timeline. The map marks the boundary: row pitch is 24 units everywhere except between
rows 11 and 12, which is 36 — a token, not a measurement.

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
