# Resources Index

An index of [resources/](resources/) — reference material, vendor software, and
existing show/mapping files for the Stargate LED wall.

Nothing here is source code. It is the raw material the authoring pipeline has to
understand: the Color Kinetics *Light System Composer* (LSC) toolchain, the fixture
map, and the shows authored against it.

**Total:** ~890 MB, ~3,900 files (3,789 of them animation frame PNGs).

---

## The physical system

Derived by parsing `Shows/Stargate v3 - Pacman.map`:

| Property | Value |
|---|---|
| Controllers | 4x sPDS-480ca 7.5V Ethernet |
| Controller firmware | `SFT-000098-00` rev 03 |
| Ports | 16 per controller = 64 total |
| Modules | 2 per port = 128 iColor Module FX 6:36 |
| Nodes per module | 36 |
| **Total pixels** | **4,608** |
| Logical canvas | **192 x 24** |
| Coordinate units | 24 per pixel; X 60→4644, Y 84→648, Z always 0 |

Each controller drives exactly one quadrant (1,152 px = 12 rows x 96 cols):

| Controller | Rows | Cols |
|---|---|---|
| `CTRL-A` | 0–11 | 0–95 |
| `CTRL-B` | 0–11 | 96–191 |
| `CTRL-C` | 12–23 | 0–95 |
| `CTRL-D` | 12–23 | 96–191 |

Serials and IP addresses are deliberately not recorded in this repository, which is
public. They are in `resources/NETWORK.md` (untracked), and in the `.map` itself.

### Physical layout: two ceiling strips

The wall is **two long strips running along either side of the ceiling**, each
192 x 12 px (32 modules long, 2 modules wide, 16:1). The 192 x 24 canvas is a
*logical* stacking of two physically separate runs.

The split is by **row band**, not column, and three independent facts confirm it:

1. **The v2 map encoded the boundary.** In `Stargate v2.map` and `Stargate v2 - with
   Rows.map`, Y pitch is 24 units for every row *except* between rows 11 and 12, which
   is **120** — a deliberate marker at exactly the predicted seam. The canonical
   `Stargate v3 - Pacman.map` **dropped it**: v3 is a uniform 24-unit lattice in both
   axes, 192 x 24 with no seam. So this is corroboration from history, not from the map
   in use; facts 2 and 3 are what hold it up today.
2. **Controller quadrants** split 0–11 / 12–23 (table above).
3. **Group names.** The map author labeled them: `Row R1`–`R12` are rows 0–11,
   `Row L1`–`L12` are rows 12–23. "Left/Right" is the ceiling side; "Front/Back" is
   position along the corridor (column half).

Each port drives one **6 x 12 cross-section** — 2 modules stacked across the strip's
full width — so port boundaries run crosswise. That a port maps to a complete
cross-section confirms the strip is 12 px wide; the alternative column-split reading
gives 96 x 24 blocks at only 4:1, which is not strip-shaped and would cut ports in
half.

**Consequence for content.** The strips face each other across the room, so anything
drawn across the full 24 rows is never seen as one image — a shape across rows 10–13 has
its halves on opposite walls. A faithful preview draws the two bands well apart.

Note the v2 gap was a *token* separator, not a measurement — 5x pixel pitch, where a real
corridor is tens of pitches wide. It marked the seam; it did not size it.

### Half-pitch: the grid under the grid

The map's base grid unit is **12**, not 24, and every pixel sits at an *odd* multiple of
it. In `Stargate v3 - Pacman.map`, `x` runs 60, 84, … 4644 → `x/12` = 5, 7, … 387 (192
odd values); `y` runs 84, 108, … 636 → `y/12` = 7, 9, … 53 (24 odd values). On the native
grid the LEDs occupy odd cells with an empty cell between each. `Old/LightJoy.map` is laid
out at pitch 12 directly, which is what makes 12 the real unit rather than an artifact.

| Region | Pixels | Half-pitch cells |
|---|---|---|
| `All (front)` | 192 x 24 | 383 x 47 |
| `Front (center)` | 96 x 24 | **191 x 47** |
| One strip | 192 x 12 | 383 x 23 |

**This explains the legacy art sizes, and they are not mistakes.** The PacMan master is
191 x 47 — exactly `Front (center)`. `Warning Sign 24x24.png` is 26 x **23** — one strip
tall. `Animation Template.png` is 765 x 93 = the full canvas at 4x, `(192−1)·4+1` by
`(24−1)·4+1`; since Management Tool generates it, the vendor's own tooling works in this
space.

Consequences:

- **Scaling in this space is `(n−1)k+1`, not `n·k`.** Multiplying the 191 x 47 master by
  `m` gives 191m x 47m where the exact size is 190m+1 x 46m+1, so every PacMan render is
  `m−1` px too large (table under `PacMan Animation/` below). The error is 0 at the
  top-left and grows to `(m−1)/2m` ≈ **half an LED** at the bottom-right — a *sharpness
  gradient* across the wall, worst on the 10x render. Testable against memory: was the
  softness uneven end to end?
- **Two conventions are possible and we do not yet know which the LSM uses.** *Cell* —
  each pixel owns a 24-unit cell, group bbox 192 x 24 pixels. *Centre* — first pixel
  centre to last, bbox 191 x 23 spans, which is what the half-pitch sizes assume.
- **192 x 24 native is exact under both**, which is the practical takeaway. Cell is 1:1;
  centre puts LED `i` at `i·191/191 = i`. Half-pitch sizes like 191 x 47 are exact under
  centre only, and my earlier "should have been 192 x 48" is exact under cell only.
  Native also makes `smooth` moot, since every sample lands on an integer.
- **Rendering above native is the deeper error regardless of convention.** The LSM reduces
  to the pixel count either way, so an upscale plus its downscale is two lossy resamples
  where zero were needed. The `sharp`/`less sharp` variants were fighting a filter the
  pipeline introduced itself.
- **Aspect ratio is still an open risk.** `Front (center)` is 2280 x 552 raw units
  (4.130:1), 191 x 47 half-cells (4.064:1), or 96 x 24 pixels (4.0:1). If the LSM
  letterboxes instead of stretching to the bbox, exactness breaks at any source size —
  the spike's corner-dot pattern is what catches this.

### The two runs are antiparallel

`Warp Tunnel.sho` drives its 8 chevrons as paired `Image Scroll` effects, identical in
timing, opposite in everything else:

| | Right (gid 2596, rows 0–11) | Left (gid 5001, rows 12–23) |
|---|---|---|
| Art | `N Chevron.png` | `N Chevron (rev).png` |
| Scroll x | 191 → −191 (decreasing) | −167 → 215 (increasing) |
| Effects | `Rotate 1`–`8` | `Rotate 1R`–`8R` |

`(rev)` is a **horizontal** mirror — confirmed by diffing the PNGs; the art is
vertically symmetric, so a vertical flip would be a no-op. The strips therefore scroll in
opposite *canvas* directions while moving the same direction in the *room*, which means
the two runs are addressed from opposite ends of the corridor.

So `(rev)` is compensation for backwards wiring, not corridor-axis symmetry. The old
pipeline paid for that by hand, in mirrored assets and per-effect reversed scrolls.

The chevron art is 52 x 24 and both groups draw it at `starty` 12 — one full-height shape
that each 12-row group clips in half, putting `\` on one wall and `/` on the other.

---

## File formats

| Ext | What it is |
|---|---|
| `.map` | Fixture map. UTF-16LE XML with BOM, no XML declaration. |
| `.sho` | Show file. UTF-16LE XML with BOM, CRLF. A list of timed, layered effects. |
| `.pck` | LSC database export. Encrypted — `openssl enc` salted (`Salted__` magic). |
| `.osp` | OpenShot project (JSON) used to prep the PacMan video. |
| `.lnk` | Windows shortcuts to LSC tools — dead on Linux, useful as a record of tool names. |

### `.map` schema

```
<map>
  <imagefile> <postsync>
  <c>                     controller x4
    <t> <s> <n> <sn> <ip> <mac> <d> <v> <vs>
    <ids/>                present but empty
    <pl><p><pn><pt><pf></p> x16</pl>        port list
    <l>HEX</l> x1152      ids of the nodes this controller drives
  </c>
  <l>                     node x4608
    <t> <st> <s>          <s> is the node's hex id
    <n>Port 01 Module-1 Node 002</n>
    <pn> <ln> <f>
    <c>CTRL-A</c>       owning controller serial
    <fc>
    <x> <y> <z>           position; canvas col = (x-60)/24
    <q0..q3>              orientation quaternion (identical for all nodes)
    <ch>                  channel
  </l>
  <g>                     group x4646
    <t>                   1 = user group (38), 3 = per-node singleton (4608)
    <s>                   group id, hex
    <n>                   name
    <c>HEX</c> ...        member node ids
  </g>
</map>
```

**`<l>` is overloaded.** It is both the node element *and* a bare hex id reference.
The 9,216 occurrences are 4,608 node definitions plus 4,608 references inside the four
controller blocks. Count `<x>` to get the real node count. Group members are `<c>`,
not `<l>`.

### Groups → `gid`

**A show's `gid` is the decimal value of a group's hex `<s>`.** Every `gid` used by
every show resolves. All 38 user groups map to clean canvas regions:

| Group | gid | Region |
|---|---|---|
| `All (front)` | 4999 | rows 0–23, cols 0–191 (all 4,608) |
| `Right (front)`, `Right (top)`, `Right (front-top corner)` | 2596, 2597, 5005 | rows 0–11 |
| `Left (front)`, `Left (top)`, `Left (front-top corner)` | 5001, 5002, 5004 | rows 12–23 |
| `Front (center)` | 2410 | rows 0–23, cols 0–95 |
| `Back (center)` | 2603 | rows 0–23, cols 96–191 |
| `Right-Front (cen)` / `Right-Back (cen)` | 1378 / 2595 | rows 0–11, cols 0–95 / 96–191 |
| `Left-Front (cen)` / `Left-Back (cen)` | 3798 / 5000 | rows 12–23, cols 0–95 / 96–191 |
| `Row R1`…`R12` | 1966…2373 | single rows 0–11 |
| `Row L1`…`L12` | 2447…2606 | single rows 12–23 |
| `Edges (front)` | 5003 | rows 0, 11, 12, 23 (768 px) |

Several groups are duplicates by region (`Right (front)` / `Right (top)` /
`Right (front-top corner)` all cover rows 0–11) — legacy naming from the 2016 build.

### `.sho` schema

A flat sequence of nested `<effect>` blocks. The first is always a `Meta Effect`
acting as the container/timeline. Each effect carries a 21-field envelope — `type`,
`gid`, `transparency`, `priority`, `begin`, `end` (ms), `fadein`, `fadeout`, `name`,
`eid`, plus start/end linking fields — then type-specific parameters:

| Type | Parameters |
|---|---|
| `Meta Effect` | `loop`, `brightness` |
| `Animation` | `animationdir`, `preload`, `fps`, `xoffset`, `yoffset`, `scale`, `transcolor`, `transenabled`, `smooth` |
| `Image Scroll` | `imagefile`, `cycletime`, `startx/y`, `endx/y`, `startscale`, `endscale`, `smooth`, `transcolor`, `transenabled`, `bgcolor` |
| `Sweep` | `fgcolor`, `bgcolor`, `cycletime`, `reverse`, `fgtrans`, `bgtrans` |
| `Streak` | `fgcolor`, `bgcolor`, `width`, `fwdtail`, `revtail`, `reverse`, `cycletime`, `fgtrans`, `bgtrans`, `wrap` |
| `Sparkle` | `decay`, `density`, `cycletime`, `sparklecolor`, `bgcolor`, `sparkletrans`, `bgtrans` |
| `XYSpiral` | `cycletime`, `twist`, `number`, `clockwise`, `centerx`, `centery` |
| `XYBurst` | `cycletime`, `width`, `centerx`, `centery`, `cycledir`, `rainbowdir` |
| `Chasing Rainbow` | `cycletime`, `groupoffset`, `reversedir`, `reversecolor`, `startcolor` |
| `Fixed Color` | `color`, `white` |

`Animation` and `Image Scroll` reference external files by **absolute Windows path**
(`G:/My Drive/Fuse Live Arts/Artwork/Stargate/...`). Everything else is parametric,
rendered inside the LSM.

### How a show reaches the wall

From `Creating Shows.pdf`:

```
Show Designer (PC, part of LSC)  →  .sho  →  downloaded to the LSE  →  LSM plays it
                                                                    →  KiNET → sPDS → LEDs
```

> "Once your light show is complete, save it for use in the LSE. Light shows **downloaded
> to the LSE must be saved as show (.SHO) files.**"

So `.sho` is the *required interchange format* into the LSE, not merely an export — which
is the seam the authoring tool targets. "LSE" is what the `LSE-Database-Export` `.pck`
files are exports of.

The Animation workflow (Chapter 6, *Animation Setup Steps*) is: choose Animation → pick a
group → Browse to the directory of graphic files → **Load** → set fps → set X-Y offset and
scale. There is an explicit ingest step, and LSC accepts `.PNG`, `.XPM`, `.JPG`, `.BMP`.

Two consequences:

- **`animationdir` only has to be valid on the LSC machine when the show is loaded** — not
  at playback. The LSM is an appliance that cannot mount a Windows `G:` drive, so the
  frames must travel with the show on download. (Inferred, not documented.)
- **A show can always be built by hand from frames alone**, which is why generating `.sho`
  is a convenience rather than a dependency.

Note also that the doc tells authors to insert "the animation template you created with
Management Tool" as a layer — so `Animation Template.png` (765 x 93) is a **Management Tool
output**, not a chosen authoring size. It is not a multiple of 192 x 24 because it is not
in pixel space at all: 765 x 93 is `(192−1)·4+1` by `(24−1)·4+1`, the full canvas at 4x
half-pitch. This is the vendor confirming the convention, and it is where the legacy
master sizes came from.

---

## `resources/` tree

### Top level — documentation

| File | Notes |
|---|---|
| `LSM_UserGuide.pdf` | 14 MB. The Light System Manager manual. |
| `LSM_QuickStart.pdf` | Short-form LSM setup. |
| `Creating Shows.pdf` | 3.3 MB, 2016. How shows are authored in Show Designer. |
| `Quick Start Guide.pdf` / `.docx` | Site-specific operating instructions (docx updated Oct 2025). |

### `Shows/` — 768 MB

**Maps**
- `Stargate v3 - Pacman.map` (4.0 MB) — newest, canonical.
- `Stargate v2 - with Rows.map` (3.9 MB) — same 4,608 nodes, 36 groups instead of 38.

**Shows**

| File | Size | Contents |
|---|---|---|
| `PacMan.sho` | 3.2 KB | 1 `Meta Effect` + 1 `Animation`. **The template for generated shows.** |
| `Warp Tunnel.sho` | 135 KB | 83 effects — 33 `Sweep`, 24 `Image Scroll`, 12 `Streak`, 10 `Fixed Color`, 2 `Chasing Rainbow`, 1 `Sparkle`. |
| `Starscape.sho` | 105 KB | 65 effects — 41 `Streak`, 23 `Sparkle`. |
| `Rainbows.sho` | 78 KB | 53 effects — 30 `Sweep`, 14 `XYSpiral`, 2 each `XYBurst`/`Sparkle`/`Fixed Color`/`Chasing Rainbow`. |

`Animation Template.png` — 765 x 93 authoring template, i.e. the full 192 x 24 canvas
at ~4x.

**`Shows/Warp Tunnel Images/`** (184 KB) — 33 PNG/PSD sprites scrolled by
`Warp Tunnel.sho`. Bars 18 x 24, chevrons 52 x 24, each in forward and `(rev)`
variants numbered 1–8 (a brightness/blackbody progression; see
`Chevrons - Blackbody Progression.psd`). All 24 px tall — full canvas height.

The scroll effects are evidence that **`Image Scroll` works in pixel space, cell
convention** — unlike the half-pitch animation masters. Each is `startx` 191 → `endx`
−191 on a 192-px-wide canvas, with `starty`/`endy` 12 on a *12-row* group: the art is
placed on the full 24-row canvas and the `gid` merely masks it to one strip. A half-pitch
reading would need 383-wide travel and 23-tall art. Whether `Animation` shares that space
is exactly gate 2.

**`Shows/PacMan Animation/`** (735 MB — nearly the whole folder)
- `Losing Match - PacMan.mp4`, `Winning Match - PacMan.mp4` — 173 MB each, raw source.
- `Losing Match - PacMan - Edited.mp4` (11 MB), `PacMan - Losing Match edit 2.mp4`
  (2.7 MB, 2280x552, 31 s) — 2280 x 552 is the `Front (center)` bounding box in *raw* map
  units (95 x 23 pitches of 24), another sign the pipeline worked in map space.
- `PacMan Video Edits.osp` + `_assets/` — OpenShot project, 30 fps, 1910x470.
- Four rendered frame sequences of ~937 PNGs each:

  | Directory | Frame size | vs. master | Exact size | Off by |
  |---|---|---|---|---|
  | `rescaled 10x, sharp, sat` | 1910 x 470 | 10x | 1901 x 461 | 9 px |
  | `rescaled 10x, sharp, less sat` | 764 x 188 | 4x | 761 x 185 | 3 px |
  | `rescaled 3x, less sharp, less sat` | 1910 x 470 | 10x | 1901 x 461 | 9 px |
  | `rescaled 3x, sharp, sat` | 573 x 141 | 3x | 571 x 139 | 2 px |

  The directory names do not match the actual sizes. All are upscales of a **191 x 47
  master**, and the master itself is right — it is `Front (center)` in half-pitch cells.
  The renders are not: scaling in that space is `(n−1)k+1`, so each is `m−1` px too large
  and drifts up to half an LED by the far corner. See *Half-pitch* above.

  **The master is 96 x 24 at 2x, not the full canvas.** `PacMan.sho` targets
  `gid` 2410 = `Front (center)` = rows 0–23, cols 0–95 — the front *half* of the
  corridor across both strips. 96 x 24 is 4:1, matching the master's 4.06:1; the full
  192 x 24 canvas is 8:1 and does not fit.

- Logos/overlays: `PacMan Logo.png`, `PacMan Logo (no border).png`, `Player One.png`,
  `Ready!.png`, `EDI 017 Class Schedule.png`.

**`Shows/Old/`** (4.5 MB) — superseded maps: `9x Demo.map` (2016), `9x Demo 2025.map`
(both ~650 nodes, a small test rig), `LightJoy.map` (3.9 MB, 9,528 nodes — a
*different, larger* installation). Plus `Student Scripts/` — three 2016 student `.sho`
files.

**`Shows/Backups/`** (20 MB) — dated copies of the above, plus two encrypted
`LSE-Database-Export` `.pck` files (1.9.1, 1.9.6). Reference only.

### `Light System Composer/` — 72 MB, vendor software

Windows-only. Kept for reinstall.

| Item | Notes |
|---|---|
| `Installer 2.3.2/` | 59 MB single-exe installer, May 2025 — newest. |
| `Installer 1.9.0/` | 3.6 MB MSI + legacy `InstMsi` bootstrappers (2015). What the `.lnk`s point at. |
| `Installer 1.8.6/` | 2005-era. Includes `LSC User Guide.pdf`, `LSC Quick Start Guide.pdf`, release notes, and `Utilities/` shortcuts: EtherSAS, SAS, PDSTool, KeypadConfigTool, KinetInterfaceConfigTool. |
| `LSC 1.9.0/`, `*.lnk` | Shortcuts to ShowDesigner, ManagementTool, KeypadConfigTool. |

### `Concept/` — 49 MB, design and build documentation

- `Model.dwg` (32 MB) — AutoCAD model.
- `Module Diagram.xlsx` — module layout / wiring plan.
- Renders: `1) Location.png`, `2) Bottom.png`, `3) Top.png`, `4) ISO Background.png`.
- Photos/video from the 2016 build.
- `LightJoy - Model.png.jpg`, `LightJoy - Nittany Lion.jpg` — the earlier LightJoy install.

Note these renders show a single suspended box fixture at a corridor intersection, not
the current wall. They are 2016-era and superseded by the v2/v3 maps.

---

## Reading these files on Linux

UTF-16LE with a BOM, so most tools need a conversion first:

```sh
iconv -f UTF-16LE -t UTF-8 "resources/Shows/Stargate v3 - Pacman.map" | less
```

Python handles it directly with `open(path, encoding='utf-16-le')` — strip the leading
`\ufeff`.

---

## Open questions

**1. Does Show Designer open a hand-written `.sho`?** *Downgraded.* `Creating Shows.pdf`
establishes that `.sho` is the required format for downloading a show to the LSE, so it is
an interchange format rather than a one-way dump. And frames can always be loaded by hand
(Browse → Load), so a refusal costs pre-filled settings, not the pipeline. Still worth
testing, but it is no longer load-bearing.

**2. Does `Animation` map pixels 1:1 at `scale` 1 with `smooth` 0?** In the only
known-good case the LSM is doing a **~20x downscale** internally — `PacMan.sho` points at
1910 x 470 frames with `smooth` 1 against a 96 x 24 target region. Native-resolution
passthrough has never been observed here. Confirm it.

*Lower stakes than it looks.* 192 x 24 is exact under both the cell and centre
conventions (see *Half-pitch* above), and `Image Scroll` already demonstrably works in
pixel space, so native is the right bet even unconfirmed. What the spike's stripe patterns
settle is whether `Animation` agrees; if it does not, the fallback is 383 x 47.

**3. Absolute strip orientation.** *Partly resolved* — the two runs are antiparallel
(above). What remains is absolute: which physical wall is the Right strip, and which end
of the corridor is column 0. Both are global one-parameter flips you would spot in the
first second of playback. Light one module at a time to settle them.

**4. ~~Physical gap width.~~** No longer load-bearing. The preview draws a fixed visual
separator rather than a scaled gap, since the strips are on opposite walls and no width
is "correct."

### Archived

Relevant only if the LSM is ever replaced, which is not the current plan:

- **Ethernet keypad protocol.** `LSM_UserGuide.pdf` documents only the *serial* keypad
  (Appendix D). For the Antumbra **Ethernet** keypad it points at a dead URL, and there
  is no keypad config file anywhere in `resources/` — only a `KeypadConfigTool`
  shortcut.
- **KiNET wire format.** Not printed in the guide. Commonly cited as UDP port 6038;
  unverified. `KinetInterfaceConfigTool` and `PDSTool` are the best pointers to the
  configuration surface.
- **Encrypted database exports.** The two `.pck` files may hold schedules and keypad
  bindings.
