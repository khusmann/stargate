# Resources Index

An index of [resources/](resources/) — the reference material, vendor software, and
existing show/mapping files for the Stargate LED wall.

Nothing here is source code. It is the raw material a replacement app has to
understand: the Color Kinetics *Light System Composer* (LSC) toolchain, the fixture
map for the installation, and the shows authored against it.

**Total:** ~890 MB, ~3,900 files (3,789 of them are animation frame PNGs).

---

## The physical system (as recorded in the map files)

Derived by parsing `Shows/Stargate v3 - Pacman.map`:

| Property | Value |
|---|---|
| Controllers | 4x sPDS-480ca 7.5V Ethernet |
| Controller IPs | [redacted], .117, .123, .135 |
| Controller serials | CTRL-D, CTRL-C, CTRL-A, CTRL-B |
| Controller firmware | `SFT-000098-00` rev 03 |
| Ports | 16 per controller = 64 total |
| Modules | 2 per port = 128 iColor Module FX 6:36 |
| Nodes per module | 36 |
| **Total pixels** | **4,608** |
| Logical canvas | **192 x 24** (192 unique X positions, 24 unique Y) |
| Coordinate units | 24 per pixel; X 60→4644, Y 84→636, Z always 0 |

That 192x24 canvas is the single most important number in this repo — the image and
video assets below are all authored to that aspect ratio (~8:1).

---

## File formats found here

| Ext | What it is |
|---|---|
| `.map` | Fixture map. UTF-16LE XML. Controllers, ports, per-node position/channel, groups. |
| `.sho` | Show file. UTF-16LE XML. A list of timed, layered effects. |
| `.pck` | LSC database export. **Encrypted** (`openssl enc` salted) — not readable without LSC. |
| `.osp` | OpenShot project (JSON) used to prep the PacMan video. |
| `.lnk` | Windows shortcuts to LSC tools — dead on Linux, useful only as a record of tool names. |

### `.map` schema (UTF-16LE XML, no declaration)

```
<map>
  <imagefile/> <postsync/>
  <c>                       controller
    <t> <s> <n> <sn> <ip> <mac> <d> <v> <vs> <ids>
    <pl><p><pn><pt><pf></p>...</pl>    port list
  </c> x4
  <l>                       light / node  (4,608 of these)
    <t> <st> <s>
    <n>Port 01 Module-1 Node 002</n>
    <pn> <ln> <f> <c> <fc>  port, light no., fixture, controller serial
    <x> <y> <z>             position on the canvas
    <q0..q3>                orientation quaternion
    <ch>                    channel
  </l>
  ...groups, whose members are <l>HEX</l> id references
</map>
```

Note the ambiguity: `<l>` is used both as the node element **and** as a hex id
reference inside group lists. Grepping `<l>` naively counts 9,216; the real node
count is 4,608 (count `<x>` instead).

### `.sho` schema (UTF-16LE XML, CRLF)

A flat sequence of `<effect>` blocks, each with `type`, `gid`, `transparency`,
`priority`, `begin`, `end` (ms), `fadein`, `fadeout`, `name`. The first is always a
`Meta Effect` acting as the container/timeline.

Effect types observed across all shows:
`Meta Effect`, `Sweep`, `Streak`, `Sparkle`, `XYSpiral`, `XYBurst`, `Fixed Color`,
`Chasing Rainbow`, `Image Scroll`, `Animation`.

---

## resources/ tree

### Top level — documentation

| File | Notes |
|---|---|
| `LSM_UserGuide.pdf` | 14 MB. The Light System Manager manual. Primary protocol/behavior reference. |
| `LSM_QuickStart.pdf` | Short-form LSM setup. |
| `Creating Shows.pdf` | 3.3 MB, 2016. How shows are authored in Show Designer. |
| `Quick Start Guide.pdf` / `.docx` | Site-specific operating instructions (docx updated Oct 2025). |
| `ShowDesigner 1.9.0.lnk` | Shortcut. |

### `Shows/` — 768 MB, the show content

**Current maps**
- `Stargate v3 - Pacman.map` (4.0 MB) — newest, 4,608 nodes. Use this as the canonical layout.
- `Stargate v2 - with Rows.map` (3.9 MB) — same 4,608 nodes, earlier grouping.

**Current shows**
- `Warp Tunnel.sho` (135 KB) — 83 effects; heaviest use of `Image Scroll`, pairs with `Warp Tunnel Images/`.
- `Starscape.sho` (105 KB) — 65 effects, all `Streak` + `Sparkle`.
- `Rainbows.sho` (78 KB) — 53 effects, `Sweep`/`XYSpiral`/`XYBurst`.
- `PacMan.sho` (3.2 KB) — trivial: one `Meta Effect` + one `Animation` pointing at the frame sequence.
- `Animation Template.png` — 765x93 authoring template.

**`Shows/Warp Tunnel Images/`** (184 KB) — 33 PNG/PSD sprites scrolled by `Warp Tunnel.sho`.
Bars are 18x24, chevrons 52x24, each in forward and `(rev)` variants numbered 1–8
(a brightness/blackbody progression; see `Chevrons - Blackbody Progression.psd`).
**All are 24 px tall — i.e. full canvas height.**

**`Shows/PacMan Animation/`** (735 MB — nearly the whole folder)
- `Losing Match - PacMan.mp4`, `Winning Match - PacMan.mp4` — 173 MB each, raw source.
- `Losing Match - PacMan - Edited.mp4` (11 MB), `PacMan - Losing Match edit 2.mp4` (2.7 MB, 2280x552, 31 s).
- `PacMan Video Edits.osp` + `_assets/` — OpenShot project, 30 fps, 1910x470.
- Four rendered frame sequences, ~937 PNGs each (3,749 files total), named
  `PacMan - Losing Match-#####.png`:

  | Directory | Frame size |
  |---|---|
  | `rescaled 10x, sharp, sat` | 1910x470 |
  | `rescaled 10x, sharp, less sat` | 1910x470 |
  | `rescaled 3x, less sharp, less sat` | 1910x470 |
  | `rescaled 3x, sharp, sat` | 573x141 |

  Note the naming is misleading — only the last is actually 3x-sized. All are
  upscales of a 191x47 master, which is 192x24 stretched ~2x vertically.
- Logos/overlays: `PacMan Logo.png`, `PacMan Logo (no border).png`, `Player One.png`,
  `Ready!.png`, `EDI 017 Class Schedule.png`.

**`Shows/Old/`** (4.5 MB) — superseded maps: `9x Demo.map` (2016), `9x Demo 2025.map`
(both ~650 nodes, a small test rig), `LightJoy.map` (3.9 MB, 9,528 nodes — a
*different, larger* installation). Plus `Student Scripts/` — three 2016 student
`.sho` files.

**`Shows/Backups/`** (20 MB) — dated copies of the above maps and shows, plus the two
encrypted `LSE-Database-Export` `.pck` files (1.9.1, 1.9.6). Reference only; don't
edit.

### `Light System Composer/` — 72 MB, vendor software

Windows-only. Kept for reinstall and for reverse-engineering the on-wire protocol.

| Item | Notes |
|---|---|
| `Installer 2.3.2/` | 59 MB single-exe installer, May 2025 — newest. |
| `Installer 1.9.0/` | 3.6 MB MSI + legacy `InstMsi` bootstrappers (2015). This is the version the `.lnk`s point at. |
| `Installer 1.8.6/` | 2005-era. Includes `LSC User Guide.pdf`, `LSC Quick Start Guide.pdf`, v1.8/v1.8.6 release notes, and `Utilities/` shortcuts: EtherSAS, SAS, PDSTool, KeypadConfigTool, KinetInterfaceConfigTool. |
| `LSC 1.9.0/`, `*.lnk` | Shortcuts to ShowDesigner, ManagementTool, KeypadConfigTool. |

The 1.8.6 utility list is the best inventory of what discrete tools exist —
`PDSTool` and `KinetInterfaceConfigTool` in particular hint at the sPDS/KiNET
configuration surface a replacement app would need.

### `Concept/` — 49 MB, design and build documentation

- `Model.dwg` (32 MB) — AutoCAD model of the installation.
- `Module Diagram.xlsx` — module layout / wiring plan.
- Renders: `1) Location.png`, `2) Bottom.png`, `3) Top.png`, `4) ISO Background.png`.
- Photos/video from the 2016 build: `20160311_163839-1.jpg`, `20160309_232504.mp4`.
- `LightJoy - Model.png.jpg`, `LightJoy - Nittany Lion.jpg` — the earlier LightJoy install.

---

## Reading these files on Linux

The XML is UTF-16LE with a BOM, so most tools need a conversion first:

```sh
iconv -f UTF-16LE -t UTF-8 "resources/Shows/Stargate v3 - Pacman.map" | less
```

## Gaps

Open questions that block a replacement app, roughly in priority order.

**1. Ethernet keypad protocol — the one real unknown.**
`LSM_UserGuide.pdf` documents only the *serial* keypad (Appendix D: Serial Keypad
Protocol). For the Antumbra **Ethernet** keypad it points at
`www.colorkinetics.com/ls/controllers/enetkeypad/`, a dead URL. There is no keypad
config file anywhere in `resources/` — only a `KeypadConfigTool` shortcut. Since
keypad triggering is core to how the installation is actually used, resolve this
early: capture traffic from the working keypad, or run `KeypadConfigTool` under the
existing LSC install and watch what it sends.

**2. KiNET wire format not specified here.**
The guide establishes that KiNET is Philips Color Kinetics' Ethernet protocol and
that the system is UDP-based, but does not print packet layouts. Commonly cited as
UDP port 6038 — *treat that as unverified*; confirm by capturing traffic from the
working LSM before building against it. Also unresolved: whether output is addressed
per-controller (4 packets/frame) or per-port (64 packets/frame, 216 B each).
`Light System Composer/Installer 1.8.6/Utilities/` contains `KinetInterfaceConfigTool`
and `PDSTool` shortcuts, which are the best pointers to the configuration surface.

**3. Encrypted database exports.**
The two `Shows/Backups/LSE-Database-Export*.pck` files are `openssl enc` salted
blobs. Contents unknown without LSC. May hold schedules and keypad bindings — worth
revisiting if (1) stays blocked.

**4. Physical layout is not recorded in the map.**
The `.map` is a flat 192x24 canvas: every node has `z=0` and an identical orientation
quaternion, and X is evenly spaced with no gaps. So the file cannot tell you how the
wall is physically arranged. The wiring does split cleanly in half, which is
consistent with two separate runs:

| Controller | Columns | Rows |
|---|---|---|
| `CTRL-A` | 0–95 (left half) | top 12 |
| `CTRL-C` | 0–95 (left half) | bottom 12 |
| `CTRL-B` | 96–191 (right half) | top 12 |
| `CTRL-D` | 96–191 (right half) | bottom 12 |

Two sPDS units per half, boundary exactly at column 96. If the halves are physically
on opposite walls facing each other, content authored on the flat canvas runs
continuously through that seam — down one wall and back along the other — and will
read *reversed* on one side unless the show compensates. That `Warp Tunnel Images/`
ships every chevron in both normal and `(rev)` form is suggestive but not proof.
Confirm against the room before trusting the canvas as WYSIWYG.

**5. Concept renders are stale.**
[Concept/](resources/Concept/) shows a single suspended box fixture at a corridor
intersection, not the current wall. Those files are from 2016; the v2/v3 Stargate
maps supersede them.
