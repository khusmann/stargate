#!/usr/bin/env python3
"""Generate the Stargate risk-gate spike: 192x24 test frames + two .sho files.

The two .sho files are identical except for <smooth>, so playing both answers
whether the LSM resamples at native resolution.

Usage:  python3 generate.py
"""

from PIL import Image
from pathlib import Path

W, H = 192, 24
FPS = 30
HOLD = 2                     # seconds each pattern is displayed
FRAMES_PER = FPS * HOLD
OUT = Path(__file__).parent

# Where the frames folder will live on the LSC machine. Every existing show
# sits under this root; edit here (or in the .sho) if it lands elsewhere.
ANIMDIR = ("G:/My Drive/Fuse Live Arts/Artwork/Stargate/Shows/"
           "Stargate Test/frames")

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)


def solid(c):
    return lambda im, px: [px.__setitem__((x, y), c)
                           for y in range(H) for x in range(W)]


def new():
    im = Image.new("RGB", (W, H), BLACK)
    return im, im.load()


# --- patterns -------------------------------------------------------------
# Each returns a finished 192x24 image. Order here is playback order.

def p1_black():
    im, _ = new()
    return im


def p2_all_dim():
    im, px = new()
    for y in range(H):
        for x in range(W):
            px[x, y] = (64, 64, 64)
    return im


def p3_ends():
    """Columns 0-7 white, columns 184-191 red. Which end of the corridor is white?"""
    im, px = new()
    for y in range(H):
        for x in range(0, 8):
            px[x, y] = WHITE
        for x in range(W - 8, W):
            px[x, y] = (255, 0, 0)
    return im


def p4_walls():
    """Rows 0-11 green, rows 12-23 blue. Which wall is green?"""
    im, px = new()
    for y in range(H):
        c = (0, 255, 0) if y < 12 else (0, 0, 255)
        for x in range(W):
            px[x, y] = c
    return im


def p5_vstripes():
    """1px vertical stripes. Goes flat grey if anything resamples horizontally."""
    im, px = new()
    for y in range(H):
        for x in range(0, W, 2):
            px[x, y] = WHITE
    return im


def p6_hstripes():
    """1px horizontal stripes. Goes flat grey if anything resamples vertically."""
    im, px = new()
    for y in range(0, H, 2):
        for x in range(W):
            px[x, y] = WHITE
    return im


def p7_checker():
    """1px checkerboard - the harshest resampling test."""
    im, px = new()
    for y in range(H):
        for x in range(W):
            if (x + y) % 2 == 0:
                px[x, y] = WHITE
    return im


def p8_corners():
    """Single lit pixels at the four corners + centre. Tests extreme addressing."""
    im, px = new()
    for (x, y) in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        px[x, y] = WHITE
    px[W // 2, H // 2] = (255, 0, 0)
    return im


def p9_ramp():
    """8 grey steps across the length. Tests levels/gamma."""
    im, px = new()
    for i in range(8):
        v = round(255 * i / 7)
        for x in range(i * 24, (i + 1) * 24):
            for y in range(H):
                px[x, y] = (v, v, v)
    return im


PATTERNS = [
    ("black",     p1_black),
    ("all dim",   p2_all_dim),
    ("ends",      p3_ends),
    ("walls",     p4_walls),
    ("v-stripes", p5_vstripes),
    ("h-stripes", p6_hstripes),
    ("checker",   p7_checker),
    ("corners",   p8_corners),
    ("ramp",      p9_ramp),
]


# --- .sho -----------------------------------------------------------------

def sho(smooth: int, total_ms: int) -> bytes:
    """One Meta Effect containing one Animation, matching PacMan.sho exactly."""
    lines = [
        "<effect>",
        "<type>Meta Effect</type>",
        "<gid>0</gid>",
        "<transparency>0</transparency>",
        "<priority>0</priority>",
        "<begin>0</begin>",
        f"<end>{total_ms}</end>",
        "<fadein>0</fadein>",
        "<fadeout>0</fadeout>",
        "<name>Unnamed Effect</name>",
        "<eid>4294967295</eid>",
        "<starttype>0</starttype>",
        "<startfixedtime>0</startfixedtime>",
        "<startlinkeid>4294967295</startlinkeid>",
        "<startlinkstart>1</startlinkstart>",
        "<startlinkoffset>0</startlinkoffset>",
        "<endtype>0</endtype>",
        "<endfixedtime>0</endfixedtime>",
        "<endlinkeid>4294967295</endlinkeid>",
        "<endlinkstart>1</endlinkstart>",
        "<endlinkoffset>0</endlinkoffset>",
        "<endcyclecount>1</endcyclecount>",
        "<loop>1</loop>",
        "<brightness>1</brightness>",
        "<effect>",
        "<type>Animation</type>",
        "<gid>4999</gid>",
        "<transparency>0</transparency>",
        "<priority>0</priority>",
        "<begin>0</begin>",
        f"<end>{total_ms}</end>",
        "<fadein>0</fadein>",
        "<fadeout>0</fadeout>",
        "<name>Effect 1</name>",
        "<eid>0</eid>",
        "<starttype>0</starttype>",
        "<startfixedtime>0</startfixedtime>",
        "<startlinkeid>4294967295</startlinkeid>",
        "<startlinkstart>1</startlinkstart>",
        "<startlinkoffset>0</startlinkoffset>",
        "<endtype>2</endtype>",
        "<endfixedtime>0</endfixedtime>",
        "<endlinkeid>4294967295</endlinkeid>",
        "<endlinkstart>1</endlinkstart>",
        "<endlinkoffset>0</endlinkoffset>",
        "<endcyclecount>1</endcyclecount>",
        f"<animationdir>{ANIMDIR}</animationdir>",
        "<preload>0</preload>",
        f"<fps>{FPS}</fps>",
        "<xoffset>0</xoffset>",
        "<yoffset>0</yoffset>",
        "<scale>1</scale>",
        "<transcolor>#000000</transcolor>",
        "<transenabled>0</transenabled>",
        f"<smooth>{smooth}</smooth>",
        "</effect>",
        "</effect>",
    ]
    text = "\r\n".join(lines) + "\r\n"
    return b"\xff\xfe" + text.encode("utf-16-le")   # BOM + UTF-16LE, as PacMan.sho


# --- main -----------------------------------------------------------------

def main():
    frames = OUT / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    for old in frames.glob("*.png"):
        old.unlink()

    n = 0
    for name, fn in PATTERNS:
        im = fn()
        for _ in range(FRAMES_PER):
            n += 1
            im.save(frames / f"test-{n:05d}.png")
        print(f"  {name:<10} frames {n - FRAMES_PER + 1:>4}-{n:<4} "
              f"({(n - FRAMES_PER) / FPS:>5.1f}s - {n / FPS:>5.1f}s)")

    total_ms = round(n / FPS * 1000)
    for smooth in (0, 1):
        p = OUT / f"Stargate Test (smooth {smooth}).sho"
        p.write_bytes(sho(smooth, total_ms))
        print(f"wrote {p.name}")

    print(f"\n{n} frames, {total_ms} ms, {FPS} fps")
    print(f"animationdir: {ANIMDIR}")


if __name__ == "__main__":
    main()
