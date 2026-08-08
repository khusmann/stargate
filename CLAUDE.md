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

A single Go binary, plain HTML/JS, no build step.

```
stargate build   [dir | show.toml | show.js]   # headless, scriptable
stargate preview [dir | show.toml | show.js]   # localhost server + browser, watch & reload
stargate                                       # no args: open the UI
```

Go cross-compiles to `windows/amd64`, so the deliverable is one `.exe` on the LSC
machine with no runtime to install — a non-programmer is a first-class user here, and
double-clicking the exe opens the UI because that user has no argv. `//go:embed` bakes
in the UI. **Pure stdlib, zero cgo, no external dependencies** — nothing resamples, so
there is no image library, and there is no video ingest, so there is no `ffmpeg`.

Procedural shows are embedded JavaScript ([goja](https://github.com/dop251/goja), pure
Go): scripts rather than compiled programs, so they hot-reload in the preview and the
same binary serves both authors. JS specifically because an AI can write it — which
helps the non-programmer most.

## Authoring flow

```
frames/    ─┐
show.js    ─┼─→  validate + bake  ─→  build/Show.sho + frames/  ─→  drop on the LSC box
show.toml  ─┘                              ↓
                                   preview (two strips, zoom, pan, scrub)
```

Two audiences: I author procedurally (shows as code, rendered to frames); my friend
drops in a directory of PNGs, or writes JS in the UI editor — with a **Copy AI prompt**
button that hands any assistant the full authoring context.

**Reject, don't resample.** Input frames must be exactly 192 x 24 or the build fails.
The old pipeline hand-rendered four 937-frame directories off one video and lost track of
them: two are mislabeled (the dir named `10x` holds 4x frames, `3x` holds 10x) and one
has 936 frames instead of 937. And every master is 191 x 47 where its target region
(`Front (center)`, 96 x 24) wants an exact multiple — 192 x 48 — so every render was a
fractional downscale, with the LSM doing the final ~20x reduction itself at `smooth` 1.
The quality problem they chased with sharpness settings was an off-by-one in the master.
Requiring native size makes the resampling question disappear rather than giving people
knobs to tune it with; resizing belongs in the editor that made the frames.

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
