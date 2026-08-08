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
- Author at exactly 192 x 24; emit `scale` 1, `smooth` 0. **Unverified** — PacMan
  ships `smooth` 1 on upscaled frames, so the LSM resamples in the one known-good
  case. Confirm early that `smooth` 0 at native size passes pixels through 1:1.
- `animationdir` and `imagefile` are absolute Windows paths (`G:/My Drive/Fuse Live
  Arts/Artwork/Stargate/...`). The emitter takes the asset root as config.
- `preload` is 0 in PacMan across ~937 frames. If the first pass stutters, try 1.

## Validate first

Confirm LSC imports a hand-written `.sho`. The backups are named
`LSE-Database-Export`, hinting that shows live in a database and `.sho` is an export
format. Hand-edit one value in `PacMan.sho`, load it, see if the change takes.

## Tooling

A single Go binary, plain HTML/JS, no build step.

```
stargate build   show.toml     # headless, scriptable
stargate preview show.toml     # localhost server + browser, watch & reload
```

Go cross-compiles to `windows/amd64`, so the deliverable is one `.exe` on the LSC
machine with no runtime to install — a non-programmer is a first-class user here.
`//go:embed` bakes in the UI. The stdlib covers everything but video ingest, which
shells out to `ffmpeg`.

## Authoring flow

```
show.toml  ─┐
assets/    ─┼─→  compile  ─→  build/Show.sho + frames/  ─→  drop on the LSC box
map        ─┘                       ↓
                            preview (canvas, gutter, scrub, watch)
```

Two audiences: I author procedurally (shows as code, rendered to frames); my friend
drops in a PNG directory or a video file and the tool resamples, previews, and wraps
it.

**Own the downscale.** 192 x 24 is an 8:1 sliver, so authoring happens at a multiple —
`Animation Template.png` is 765 x 93 (≈4x), and every PacMan render is a multiple of a
191 x 47 master. The old pipeline hand-rendered four near-identical 937-frame
directories differing only in sharpness and saturation. Make resampling and grading
declared parameters, so a variant is a one-line change and a rebuild.

**Preview fidelity is the product.** Show Designer's timeline already works; what it
can't show is how content reads once the ceiling gap bisects it.

## Physical layout

Two strips along either side of the ceiling, each 192 x 12 (32 modules long, 2 wide).
The 192 x 24 canvas stacks them. Verified against the map:

| Strip | Rows | Controllers |
|---|---|---|
| Right | 0–11 | `CTRL-A` (.123, cols 0–95) + `CTRL-B` (.135, cols 96–191) |
| Left | 12–23 | `CTRL-C` (.117, cols 0–95) + `CTRL-D` (.81, cols 96–191) |

Each port drives one 6 x 12 cross-section, so port boundaries run crosswise.

Content spanning all 24 rows is **bisected by the ceiling gap** — top 12 rows on one
side of the corridor, bottom 12 on the other. The map marks the boundary: row pitch is
24 units everywhere except between rows 11 and 12, which is 36. Treat the canvas as two
bands sharing a timeline, give the preview a gutter there, and make mirroring across
the corridor axis first-class (the Warp Tunnel art ships every chevron in normal and
`(rev)` form for this reason).

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

See [RESOURCES.md](RESOURCES.md) for the `resources/` index: vendor docs, the fixture
map, `.sho`/`.map` formats, and show assets.
