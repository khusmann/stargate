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


NOTES = {
    "black":     "nothing lit?",
    "all dim":   "does everything light up — both strips, full length?",
    "ends":      "which end of the corridor is white?",
    "walls":     "which side of the room is green?",
    "v-stripes": "crisp stripes, or flat grey?",
    "h-stripes": "crisp stripes, or flat grey?",
    "checker":   "the harshest resampling test",
    "corners":   "all five dots visible, exactly at the corners?",
    "ramp":      "8 distinct steps, or do the bright ones merge?",
}

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

def sho(smooth: int, total_ms: int, animdir: str = ANIMDIR) -> bytes:
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
        f"<animationdir>{animdir}</animationdir>",
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

PREVIEW_CSS = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 24px 64px; background: #0b0c0e; color: #d7dae0;
       font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; color: #f0f2f5; }
.sub { color: #7d838f; margin: 0 0 28px; }
.bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center;
       padding: 12px 0 16px; margin-bottom: 8px; background: #0b0c0e;
       border-bottom: 1px solid #1e2127; }
button { font: inherit; color: #d7dae0; background: #1a1d23; border: 1px solid #2a2f38;
         border-radius: 6px; padding: 5px 11px; cursor: pointer; }
button:hover { background: #232830; }
button[aria-pressed="true"] { background: #2f5fd0; border-color: #3f6fe0; color: #fff; }
.bar span { color: #7d838f; margin-right: 4px; }
.pat { margin: 26px 0 0; }
.hd { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; }
.nm { font-weight: 600; color: #f0f2f5; }
.tm { color: #6e737d; font-variant-numeric: tabular-nums; }
.q  { color: #8b919c; font-style: italic; }
.wall { display: inline-block; padding: 14px; background: #000;
        border: 1px solid #23262d; border-radius: 8px; overflow-x: auto; max-width: 100%; }
.strip { image-rendering: pixelated; background-repeat: no-repeat; }
.gap { height: 34px; display: flex; align-items: center; }
.gap::before { content: ""; flex: 1; border-top: 1px dashed #2c313a; }
.lbl { font-size: 11px; color: #5a606b; padding: 0 8px; letter-spacing: .04em; }
"""

PREVIEW_JS = """
const zooms = [1, 2, 4, 6, 8];
let z = 4;
function apply() {
  document.querySelectorAll('.strip').forEach(el => {
    const half = el.dataset.half | 0;
    el.style.width  = (192 * z) + 'px';
    el.style.height = (12 * z) + 'px';
    el.style.backgroundSize = (192 * z) + 'px ' + (24 * z) + 'px';
    el.style.backgroundPosition = '0 ' + (-half * 12 * z) + 'px';
  });
  document.querySelectorAll('[data-z]').forEach(b =>
    b.setAttribute('aria-pressed', (+b.dataset.z === z) + ''));
}
document.querySelectorAll('[data-z]').forEach(b =>
  b.onclick = () => { z = +b.dataset.z; apply(); });
apply();
"""


def preview_html(patterns_b64):
    rows = []
    for i, (name, note, b64, t0, t1) in enumerate(patterns_b64):
        url = f"url(data:image/png;base64,{b64})"
        rows.append(f"""<div class="pat">
  <div class="hd"><span class="nm">{i+1}. {name}</span>
    <span class="tm">{t0}–{t1}s</span><span class="q">{note}</span></div>
  <div class="wall">
    <div class="strip" data-half="0" style="background-image:{url}"></div>
    <div class="gap"><span class="lbl">rows 0–11 above · corridor · rows 12–23 below</span></div>
    <div class="strip" data-half="1" style="background-image:{url}"></div>
  </div>
</div>""")
    btns = "".join(f'<button data-z="{n}">{n}x</button>' for n in [1, 2, 4, 6, 8])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stargate spike — test patterns</title>
<style>{PREVIEW_CSS}</style></head><body>
<h1>Stargate spike — test patterns</h1>
<p class="sub">The 9 patterns as they map to the wall: two 192×12 strips on opposite
sides of the corridor. Nearest-neighbour, whole-number zoom only.</p>
<div class="bar"><span>zoom</span>{btns}</div>
{"".join(rows)}
<script>{PREVIEW_JS}</script>
</body></html>"""


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

    # Does <animationdir> have to be absolute? Every existing show uses an
    # absolute Windows path, but nothing proves relative fails. If it works,
    # exports become portable and there is no path to configure.
    p = OUT / "Stargate Test (relative path).sho"
    p.write_bytes(sho(0, total_ms, animdir="frames"))
    print(f"wrote {p.name}")

    # Self-contained preview: the 9 distinct frames inlined as data URIs.
    import base64, io
    rows = []
    for i, (name, fn) in enumerate(PATTERNS):
        buf = io.BytesIO()
        fn().save(buf, format="PNG")
        rows.append((name, NOTES[name], base64.b64encode(buf.getvalue()).decode(),
                     i * HOLD, (i + 1) * HOLD))
    p = OUT / "preview.html"
    p.write_text(preview_html(rows), encoding="utf-8")
    print(f"wrote {p.name} ({p.stat().st_size / 1024:.1f} KB, self-contained)")

    print(f"\n{n} frames, {total_ms} ms, {FPS} fps")
    print(f"animationdir: {ANIMDIR}")


if __name__ == "__main__":
    main()
