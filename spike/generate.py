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
HOLD = 5                     # seconds each pattern is displayed (long enough to photograph)
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
body { margin: 0; padding: 28px 24px 56px; background: #0b0c0e; color: #d7dae0;
       font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; color: #f0f2f5; }
.sub { color: #7d838f; margin: 0 0 22px; }
.bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
       padding-bottom: 18px; border-bottom: 1px solid #1e2127; }
.bar .sep { width: 1px; height: 22px; background: #23262d; margin: 0 6px; }
.bar em { color: #7d838f; font-style: normal; margin-right: 2px; }
button { font: inherit; color: #d7dae0; background: #1a1d23; border: 1px solid #2a2f38;
         border-radius: 6px; padding: 5px 11px; cursor: pointer; }
button:hover { background: #232830; }
button[aria-pressed="true"] { background: #2f5fd0; border-color: #3f6fe0; color: #fff; }
#play { min-width: 74px; }
.clock { color: #6e737d; font-variant-numeric: tabular-nums; margin-left: auto; }

.stage { margin: 26px 0 18px; }
.wall { display: inline-block; padding: 16px; background: #000;
        border: 1px solid #23262d; border-radius: 8px; overflow-x: auto; max-width: 100%; }
.strip { image-rendering: pixelated; background-repeat: no-repeat; }
.gap { height: 46px; display: flex; align-items: center; }
.gap::before { content: ""; flex: 1; border-top: 1px dashed #2c313a; }
.lbl { font-size: 11px; color: #5a606b; padding: 0 10px; letter-spacing: .04em; }

.cap { display: flex; gap: 12px; align-items: baseline; margin: 16px 0 0; }
.cap .nm { font-weight: 600; color: #f0f2f5; font-size: 16px; }
.cap .q { color: #8b919c; font-style: italic; }

.track { display: flex; gap: 3px; margin: 20px 0 0; }
.seg { flex: 1; height: 6px; border-radius: 3px; background: #1a1d23; overflow: hidden;
       cursor: pointer; }
.seg i { display: block; height: 100%; width: 0; background: #2f5fd0; }
.seg.done i { width: 100%; background: #24406f; }

.list { list-style: none; padding: 0; margin: 22px 0 0;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px; }
.list li { display: flex; gap: 9px; align-items: baseline; padding: 7px 10px;
           border-radius: 6px; cursor: pointer; color: #8b919c; }
.list li:hover { background: #15181d; }
.list li[aria-current="true"] { background: #16233d; color: #d7dae0; }
.list b { font-weight: 600; color: inherit; }
.list .t { font-variant-numeric: tabular-nums; color: #5a606b; font-size: 12px; }
"""

PREVIEW_JS = """
const HOLD = __HOLD__, TOTAL = HOLD * PATS.length;
const top_ = document.getElementById('top'), bot = document.getElementById('bot');
const segs = [...document.querySelectorAll('.seg')];
const items = [...document.querySelectorAll('.list li')];
let z = 4, clock = 0, playing = true, cur = -1, last = performance.now();

function zoom() {
  for (const [el, half] of [[top_, 0], [bot, 1]]) {
    el.style.width  = (192 * z) + 'px';
    el.style.height = (12 * z) + 'px';
    el.style.backgroundSize = (192 * z) + 'px ' + (24 * z) + 'px';
    el.style.backgroundPosition = '0 ' + (-half * 12 * z) + 'px';
  }
  document.querySelectorAll('[data-z]').forEach(b =>
    b.setAttribute('aria-pressed', (+b.dataset.z === z) + ''));
}

function show(i) {
  cur = i;
  const p = PATS[i], url = 'url(data:image/png;base64,' + p.uri + ')';
  top_.style.backgroundImage = url;
  bot.style.backgroundImage = url;
  document.getElementById('nm').textContent = (i + 1) + '. ' + p.name;
  document.getElementById('q').textContent = p.note;
  items.forEach((li, j) => li.setAttribute('aria-current', (j === i) + ''));
}

function tick(now) {
  const dt = (now - last) / 1000; last = now;
  if (playing) clock = (clock + dt) % TOTAL;
  const i = Math.floor(clock / HOLD);
  if (i !== cur) show(i);
  segs.forEach((s, j) => {
    s.classList.toggle('done', j < i);
    s.firstElementChild.style.width =
      j === i ? ((clock - j * HOLD) / HOLD * 100) + '%' : '';
  });
  document.getElementById('clock').textContent =
    clock.toFixed(1).padStart(4, '0') + ' / ' + TOTAL.toFixed(1) + 's';
  requestAnimationFrame(tick);
}

function jump(i) { clock = i * HOLD; show(i); }
document.getElementById('play').onclick = e => {
  playing = !playing;
  e.target.textContent = playing ? '\\u23f8 pause' : '\\u25b6 play';
};
document.getElementById('prev').onclick = () => jump((cur + PATS.length - 1) % PATS.length);
document.getElementById('next').onclick = () => jump((cur + 1) % PATS.length);
segs.forEach((s, i) => s.onclick = () => jump(i));
items.forEach((li, i) => li.onclick = () => jump(i));
document.querySelectorAll('[data-z]').forEach(b =>
  b.onclick = () => { z = +b.dataset.z; zoom(); });

zoom(); show(0); requestAnimationFrame(tick);
"""


def preview_html(pats):
    data = "const PATS = [" + ",".join(
        '{name:"%s",note:"%s",uri:"%s"}' % (n, q, u) for n, q, u, _, _ in pats) + "];"
    segs = "".join('<div class="seg"><i></i></div>' for _ in pats)
    items = "".join(
        f'<li><span class="t">{t0:>2}–{t1:>2}s</span><b>{n}</b></li>'
        for n, q, u, t0, t1 in pats)
    btns = "".join(f'<button data-z="{n}">{n}x</button>' for n in [1, 2, 4, 6, 8])
    js = PREVIEW_JS.replace("__HOLD__", str(HOLD))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stargate spike — test patterns</title>
<style>{PREVIEW_CSS}</style></head><body>
<h1>Stargate spike — test patterns</h1>
<p class="sub">The {len(pats)}-pattern loop as it maps to the wall: two 192×12 strips on
opposite sides of the corridor, {HOLD}s each. Nearest-neighbour, whole-number zoom only.</p>

<div class="bar">
  <button id="play">&#9208; pause</button>
  <button id="prev">&#8592; prev</button>
  <button id="next">next &#8594;</button>
  <span class="sep"></span><em>zoom</em>{btns}
  <span class="clock" id="clock"></span>
</div>

<div class="stage">
  <div class="wall">
    <div class="strip" id="top"></div>
    <div class="gap"><span class="lbl">rows 0–11 above · corridor · rows 12–23 below</span></div>
    <div class="strip" id="bot"></div>
  </div>
  <div class="cap"><span class="nm" id="nm"></span><span class="q" id="q"></span></div>
  <div class="track">{segs}</div>
</div>

<ul class="list">{items}</ul>

<script>{data}{js}</script>
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
