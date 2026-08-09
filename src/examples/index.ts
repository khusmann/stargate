/** The bundled gallery. First thing anyone sees, and the smoke test.
 *
 *  Ordered simplest first. The opening four keep a deliberate spread — two pure
 *  `pixel` demos, one `draw` demo, and one that teaches the two-wall split — and
 *  the rest show what the format can actually carry: noise fields, easing,
 *  deterministic PRNGs, text, raymarching, and state derived from `t` rather
 *  than stored between frames.
 *
 *  Everything here is tuned for a 16:1 strip. Radial and symmetric effects
 *  mostly die at this aspect ratio; motion along the 192 axis is what reads.
 *
 *  **Every example loops seamlessly**, and that is not decoration: the wall
 *  plays the same 20 seconds for hours, so a discontinuity at the wrap is the
 *  most visible flaw a show can have. The rule is that every time-varying term
 *  must complete a whole number of cycles in `seconds` — which means deriving
 *  frequencies from `seconds` instead of picking numbers that look nice.
 *  `scripts/check.mjs` asserts frame 0 and frame N are identical for all of
 *  them, so an example that drifts fails the build.
 */

export interface Example {
  id: string;
  name: string;
  blurb: string;
  source: string;
}

const plasma = `export const name = "Plasma", fps = 30, seconds = 12;

// W is one full cycle per loop. Every time term is an integer multiple of it,
// so the last frame runs back into the first with no seam.
const W = (Math.PI * 2) / seconds;

export function pixel(x, y, t) {
  const p = W * t;
  const v = Math.sin(x * 0.06 + p * 2)
          + Math.sin(y * 0.30 - p * 3)
          + Math.sin((x + y) * 0.05 + p);
  const n = (v + 3) / 6;                        // 0..1
  return hsl(n * 300 + (t / seconds) * 360, 0.9, 0.12 + n * 0.42);
}
`;

const warp = `export const name = "Warp", fps = 30, seconds = 10;

// 96 px/s over 10 s is 960 px, exactly 40 repeats of the 24 px pattern — pick
// the speed from the loop length, not the other way round.
const SPACING = 24;
const SPEED = (SPACING * 40) / seconds;

export function pixel(x, y, t) {
  const d = (x - t * SPEED + 9600) % SPACING;
  const head = Math.max(0, 1 - d / 2);              // bright leading edge
  const tail = Math.max(0, 1 - d / 18) * 0.5;       // long fading tail
  const v = Math.min(1, head + tail);
  const centre = 1 - Math.abs((y % 12) - 5.5) / 7;  // brighter mid-strip
  return hsl(195, 0.9, v * centre * 0.6);
}
`;

const starfield = `export const name = "Starfield", fps = 30, seconds = 20;

// Speeds are quantised so every star covers a whole number of laps per loop:
// a lap is 210 px, and 210 / seconds = 10.5 px/s is one lap per show.
const LAP = 210;
const UNIT = LAP / seconds;

const stars = Array.from({ length: 60 }, () => ({
  y: Math.floor(Math.random() * 24),
  speed: UNIT * (2 + Math.floor(Math.random() * 9)),   // 2..10 laps per loop
  len: 2 + Math.floor(Math.random() * 6),
  offset: Math.random() * LAP,
}));

export function draw(ctx, t) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 192, 24);
  for (const s of stars) {
    const x = ((s.offset + t * s.speed) % LAP) - 10;
    const a = 0.35 + 0.65 * (s.speed / (UNIT * 10));
    ctx.fillStyle = \`rgba(255,255,255,\${a.toFixed(2)})\`;
    ctx.fillRect(x, s.y, s.len, 1);
  }
}
`;

const twin = `export const name = "Twin", fps = 30, seconds = 14;

// Four cycles per loop, in both directions, so both walls wrap together.
const W = ((Math.PI * 2) / seconds) * 4;

export function pixel(x, y, t) {
  const wall = y < 12 ? 0 : 1;     // opposite sides of the corridor
  const row  = y % 12;             // position across the strip
  const dir  = wall ? -1 : 1;      // travelling opposite ways
  const v = Math.sin(x * 0.08 + dir * W * t + row * 0.15);
  return hsl(wall ? 20 : 200, 0.9, Math.max(0, v) ** 2 * 0.55);
}
`;

const warpTunnel = `export const name = "Warp Tunnel", fps = 30, seconds = 24;

// Chevrons rushing the length of the corridor, surging and easing off.
//
// The trick worth stealing: don't drive position with speed * t. Integrate the
// speed curve instead, so the pattern never jumps when the speed changes.
// speed(t) = BASE + SURGE * (1 - cos(W t)) / 2, and travelled() below is its
// exact integral — which is why the surge reads as acceleration, not a seek.
//
// Both loop conditions fall out of that. W is two cycles per show, so the
// surge wraps; and mean speed BASE + SURGE/2 = 110 px/s over 24 s is 2,640 px,
// exactly 110 repeats of the 24 px spacing, so the chevrons wrap too.
const SPACING = 24;
const BASE = 45;
const SURGE = 130;
const W = ((Math.PI * 2) / seconds) * 2;

function travelled(t) {
  return BASE * t + (SURGE / 2) * (t - Math.sin(W * t) / W);
}

export function pixel(x, y, t) {
  const row = y % 12;
  const lean = Math.abs(row - 5.5) * 1.7;         // > shaped: edges lag behind
  const d = (x + lean - travelled(t) + 96000) % SPACING;

  const head = Math.max(0, 1 - d / 1.6);          // hard leading edge
  const tail = Math.max(0, 1 - d / 21) ** 2 * 0.6;
  const v = Math.min(1, head + tail);

  const surge = (1 - Math.cos(W * t)) / 2;        // 0..1, same curve as speed
  const hue = 205 - surge * 35 + row * 1.2;       // hotter the faster it goes
  return hsl(hue, 0.9, v * (0.32 + surge * 0.28) + head * 0.3);
}
`;

const aurora = `export const name = "Aurora", fps = 30, seconds = 30;

// Value noise, three octaves, entirely deterministic — no Math.random anywhere,
// so the export matches the preview frame for frame.
//
// Noise does not loop on its own, so this one *tiles*: the lattice coordinate
// wraps every PERIOD units, which makes the field seamless in its own x axis.
// Scroll it by exactly PERIOD over the show and the animation wraps with it.
// Each octave doubles both the coordinate and the period, so they all tile.
const PERIOD = 8;

function hash(n) {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

function wrap(v, period) {
  return ((v % period) + period) % period;
}

function noise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);               // smoothstep, not lerp:
  const v = yf * yf * (3 - 2 * yf);               // kills the grid artefacts
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period);
  const a = hash(x0 + yi * 157);
  const b = hash(x1 + yi * 157);
  const c = hash(x0 + (yi + 1) * 157);
  const d = hash(x1 + (yi + 1) * 157);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y) {
  return noise(x, y, PERIOD) * 0.55
       + noise(x * 2, y * 2, PERIOD * 2) * 0.30
       + noise(x * 4, y * 4, PERIOD * 4) * 0.15;
}

export function pixel(x, y, t) {
  const row = y % 12;
  const wall = y < 12 ? 0 : 1;
  const p = t / seconds;                          // 0..1 across the show

  // One slow field decides where the curtain hangs, a faster counter-scrolling
  // one decides how bright it is. They beat against each other.
  const drift = fbm(x * 0.030 + p * PERIOD, wall * 9.5);
  const centre = 2.5 + drift * 7;
  const width = 1.6 + drift * 3.4;
  const curtain = Math.max(0, 1 - Math.abs(row - centre) / width) ** 1.5;

  const shimmer = 0.55 + 0.45 * fbm(x * 0.10 - p * PERIOD * 2, row * 0.25 + wall * 3);
  const v = curtain * shimmer;

  return hsl(115 + drift * 130 + x * 0.12, 0.8, v * 0.5);
}
`;

const ember = `export const name = "Ember", fps = 30, seconds = 20;

// Fire read sideways: heat enters along one edge of each strip and decays
// across it. The palette is the whole effect — black, red, orange, white, in
// that order, with brightness carrying the shape.
//
// The flicker is stepped at STEPS per second and the step index is taken mod
// the number of steps in the show, so the flicker sequence repeats exactly.
const STEPS = 6;
const TOTAL_STEPS = STEPS * seconds;
const W = ((Math.PI * 2) / seconds) * 7;          // 7 breaths per loop

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function heat(x, t) {
  const step = Math.floor(t * STEPS) % TOTAL_STEPS;
  const cell = Math.floor(x * 0.35);
  const f = (x * 0.35) % 1;
  const smooth = f * f * (3 - 2 * f);
  const a = hash(cell + step * 71);
  const b = hash(cell + 1 + step * 71);
  return (a + (b - a) * smooth) * 0.7
       + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.09 - W * t));
}

export function pixel(x, y, t) {
  const row = y % 12;
  const fuel = heat(x, t) * (1.25 - row / 9);      // hottest along one edge
  const v = Math.max(0, Math.min(1, fuel - row * 0.045));

  // Hand-rolled palette rather than hsl(): fire is not a hue sweep, it is a
  // black-body ramp, and the red channel has to saturate long before green.
  const r = Math.min(1, v * 2.4);
  const g = Math.max(0, Math.min(1, v * 1.7 - 0.55));
  const b = Math.max(0, v * 3.1 - 2.5);
  return rgb(r * 255, g * 255, b * 255);
}
`;

const interference = `export const name = "Interference", fps = 30, seconds = 22;

// Two gratings at slightly different wavelengths. Where they agree you get a
// bright node, where they fight you get black — and the beat pattern crawls
// the length of the wall. This is the one classic effect that gets *better*
// at 16:1, because you can see the whole beat period at once.
//
// 13 cycles one way, 10 the other, one full hue rotation: all integers, so the
// whole thing closes on itself.
const W = (Math.PI * 2) / seconds;

export function pixel(x, y, t) {
  const row = y % 12;
  const a = Math.sin((x + row * 0.6) * 0.300 - W * 13 * t);
  const b = Math.sin((x - row * 0.6) * 0.327 + W * 10 * t);

  const sum = (a + b) / 2;
  const v = Math.abs(sum) ** 3;                    // cube: thin, sharp nodes
  const envelope = 0.35 + 0.65 * Math.abs(Math.cos((a - b) * 0.9));

  return hsl(255 + sum * 95 + (t / seconds) * 360, 0.85, v * envelope * 0.62);
}
`;

const rain = `export const name = "Downpour", fps = 30, seconds = 18;

// 192 independent columns, each with a head and a fading trail, and not one
// Math.random() among them: every column's phase and speed comes from a hash
// of its index, so the show is identical on every replay and every export.
//
// Speeds are whole laps per loop — a lap is FALL rows and the show is
// FALL / seconds seconds long per lap — so all 384 streaks wrap together.
const COLUMNS = 192;
const TRAIL = 7;
const FALL = 18;                       // 12 rows of strip plus a dry spell
const UNIT = FALL / seconds;

function hash(i) {
  const s = Math.sin(i * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function draw(ctx, t) {
  ctx.fillStyle = "#020308";
  ctx.fillRect(0, 0, 192, 24);

  for (let x = 0; x < COLUMNS; x++) {
    for (let wall = 0; wall < 2; wall++) {
      const seed = x + wall * 977;
      const laps = 6 + Math.floor(hash(seed) * 26);      // 6..31 per loop
      const phase = hash(seed + 0.5) * FALL;
      const bright = 0.25 + hash(seed + 0.25) * 0.75;

      const head = ((t * UNIT * laps + phase) % FALL) - 3;

      for (let k = 0; k < TRAIL; k++) {
        const row = Math.floor(head) - k;
        if (row < 0 || row > 11) continue;
        const fade = (1 - k / TRAIL) ** 2 * bright;
        const g = Math.round(120 + 135 * fade);
        ctx.fillStyle = \`rgba(70, \${g}, 255, \${fade.toFixed(3)})\`;
        ctx.fillRect(x, wall * 12 + row, 1, 1);
      }
    }
  }
}
`;

const pong = `export const name = "Corridor Pong", fps = 30, seconds = 32;

// Two games, one per wall, played at different speeds.
//
// The walls face each other across the corridor, so a single ball that hopped
// between them would only ever look like a teleport — you cannot see both walls
// as one picture. Two independent rallies work with that instead of against it:
// the same game twice, visibly out of step, which is exactly the sort of
// near-symmetry a person standing in the room can actually read.
//
// No stored state anywhere. Both balls are pure functions of t, so scrubbing
// backwards gives the frame you saw on the way forward, and the loop closes
// because each wall fits a whole number of rallies and a whole number of
// crossings into one show length.
const PADDLE = 5;
const NEAR = 3;
const FAR = 187;

// Per wall: seconds per length of the room, and per crossing of the strip.
// 32 s is 4 round trips on one wall and 5 on the other — they drift in and out
// of phase across the loop and land back together at the end.
const RALLY = [4, 3.2];
const RISE = [2, 1.6];

function triangle(u) {       // 0..1..0, period 2
  const p = u % 2;
  return p < 1 ? p : 2 - p;
}

function clamp(v) {
  return Math.max(0, Math.min(12 - PADDLE, v));
}

function paddle(ctx, x, top, y, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, top + clamp(y), 2, PADDLE);
}

export function draw(ctx, t) {
  ctx.fillStyle = "#04060a";
  ctx.fillRect(0, 0, 192, 24);

  for (let wall = 0; wall < 2; wall++) {
    const top = wall * 12;
    const rally = RALLY[wall];

    // Position from a triangle wave: end to end and back, forever, with no
    // branch for the direction and no discontinuity at the turn.
    const along = triangle(t / rally);
    const x = NEAR + 2 + along * (FAR - NEAR - 4);
    const row = 1 + triangle(t / RISE[wall]) * 9;

    // Which way it is going, so the paddle at that end is the one that tracks
    // and the trail streams out behind.
    const outbound = triangle(t / rally + 0.001) > along;

    // Centre line.
    ctx.fillStyle = "#0e1a2c";
    for (let r = 0; r < 12; r += 3) ctx.fillRect(95, top + r, 1, 2);

    const meeting = outbound ? FAR : NEAR;
    const waiting = outbound ? NEAR : FAR;

    // The receiving paddle tracks the ball; the far one drifts back to centre.
    const impact = Math.max(0, (Math.abs(along - (outbound ? 1 : 0)) < 0.12 ? 1 : 0));
    const lit = 160 + impact * 95;
    paddle(ctx, meeting, top, row - PADDLE / 2, \`rgb(\${lit}, \${lit + 20}, 255)\`);
    paddle(ctx, waiting, top, 3.5 + (row - 5.5) * 0.25, "#1e3a5f");

    // Ball, with a trail streaming out behind it.
    const back = outbound ? -1 : 1;
    for (let k = 4; k >= 0; k--) {
      const a = (1 - k / 5) ** 2;
      ctx.fillStyle = \`rgba(255,255,255,\${a.toFixed(2)})\`;
      ctx.fillRect(x + back * k * 2.2, top + row, 2, 2);
    }
  }
}
`;

const marquee = `export const name = "Marquee", fps = 30, seconds = 16;

// Text, with no assets and no font files: the canvas already has fonts, so
// \`draw\` can just ask for them. 10px on a 12-row strip is about the limit.
//
// It also shows \`ctx.copy()\`: draw once on the Right strip, duplicate onto the
// Left. A straight copy, never a mirror — the exporter owns the antiparallel
// reversal, so both walls read the same way round in the room.
//
// The scroll is expressed as PASSES repeats of the measured text width per
// loop rather than a speed in pixels, so it stays seamless whatever the font
// metrics turn out to be on the machine doing the export.
const TEXT = "STARGATE · FUSE LIVE ARTS · ";
const PASSES = 3;
const W = ((Math.PI * 2) / seconds) * 2;

export function pixel(x, y, t) {
  const row = y % 12;
  const glow = Math.max(0, 1 - Math.abs(row - 5.5) / 6.5) ** 2;
  return hsl(212 + Math.sin(x * 0.05 + W * t) * 12, 0.85, glow * 0.10);
}

export function draw(ctx, t) {
  ctx.band("right");
  ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";

  const width = ctx.measureText(TEXT).width;
  const offset = -(((t / seconds) * PASSES * width) % width);

  for (let x = offset; x < 192; x += width) {
    ctx.fillStyle = "rgba(255, 190, 90, 0.25)";
    ctx.fillText(TEXT, x, 7);                  // soft shadow, one pixel down
    ctx.fillStyle = "#ffd9a0";
    ctx.fillText(TEXT, x, 6);
  }

  ctx.band(null);
  ctx.copy("right→left");
}
`;

const lattice = `export const name = "Lattice", fps = 30, seconds = 24;

// A travelling lattice with a moving light source: rails along the corridor,
// ties across it, and a specular highlight that sweeps past. Everything is
// derived from distance functions, which is what makes hard geometry cheap in
// a shader — no lists of objects, no draw order, just "how far am I from it".
//
// 39 ties pass per loop and the lamp makes 4 circuits: both whole numbers.
const TIE = 16;
const SPEED = (TIE * 39) / seconds;
const SPAN = 384;
const LAMP = (SPAN * 4) / seconds;

function box(v, halfWidth, soft) {              // 1 inside, 0 outside
  return 1 - Math.min(1, Math.max(0, (Math.abs(v) - halfWidth) / soft));
}

export function pixel(x, y, t) {
  const row = y % 12;
  const wall = y < 12 ? 0 : 1;
  const scroll = x + t * SPEED + wall * 13;      // walls offset, not mirrored

  // Two rails at rows 2.5 and 8.5, plus ties every TIE px.
  const rails = Math.max(box(row - 2.5, 0.4, 1.1), box(row - 8.5, 0.4, 1.1));
  const tie = box((((scroll % TIE) + TIE) % TIE) - TIE / 2, 0.7, 1.4)
            * box(row - 5.5, 3.6, 1.2);
  const frame = Math.max(rails, tie * 0.9);

  // A highlight travelling the other way, so the lattice glints as it passes.
  const lamp = ((-t * LAMP % SPAN) + SPAN) % SPAN - 96;
  const near = Math.max(0, 1 - Math.abs(x - lamp) / 46);
  const spec = near ** 3;

  const glow = frame * (0.14 + spec * 0.75) + spec * 0.06;
  return hsl(186 + spec * 60 - row * 2, 0.72 - spec * 0.4, glow * 0.62);
}
`;

const hyperspace = `export const name = "Hyperspace", fps = 30, seconds = 28;

// After "Star Nest" by Kali (Pablo Roman Andrioli), MIT licensed:
//   https://www.shadertoy.com/view/XlfGRj
//
// A volumetric fractal, sampled by marching a ray and folding space at every
// step. There is no geometry anywhere in here; the structure is what falls out
// of dividing a point by its own squared length, over and over.
//
// Two things make it work in a browser instead of on a GPU. The vector maths is
// written out as scalars — ugly, and several times faster than allocating a
// point per step, which matters at 4,608 pixels x 120 inner iterations. And it
// loops: space is tiled every TILE * 2 units, so flying exactly TRIPS tiles
// down z during the show lands on a field identical to the one it started on.
const TILE = 0.85;
const TRIPS = 18;              // tiles travelled per loop — any integer works,
                               // and this is the flythrough speed: 18 tiles in
                               // 28 s is about a tile a second
const STEPS = 10;              // volumetric samples along each ray
const ITER = 12;               // fractal folds per sample
const FOLD = 0.53;
const WOBBLE = 0.035;          // how much the fractal itself morphs, per loop
const SIDEWAYS = 5;            // tiles of drift across the field, per loop
const ROLL = 1;                // turns the ray tumbles, per loop
const FLOOR = 0.02;            // smallest divisor in the fold — see below
const ZOOM = 0.78;
const BRIGHT = 0.0026;
const DISTFADE = 0.76;
const DARK = 0.30;
const GAIN = 0.036;            // the whole accumulation is scaled once, at the end
const GAMMA = 1.9;             // pushes the dust between filaments back to black

function tile(v) {
  const m = v - Math.floor(v / (TILE * 2)) * (TILE * 2);
  return Math.abs(TILE - m);
}

export function pixel(x, y, t) {
  // The strip is 16:1, so the vertical field of view is squashed hard. That is
  // not a compromise — it is what turns the fractal into something that streams
  // along the corridor instead of sitting still in a box.
  const p = t / seconds;
  const ux = ((x - 96) / 96) * ZOOM;
  const uy = (((y % 12) - 5.5) / 5.5) * ZOOM * 0.30;

  // Flying straight down a tiled field gets repetitive fast, because the tiling
  // is the point: every TILE * 2 units is the same cell again. Three things
  // break that up without breaking the loop, since each completes a whole
  // number of periods per show — drift sideways so the path cuts a diagonal
  // through the cells, tumble the ray, and morph the fractal's own constant.
  const roll = p * Math.PI * 2 * ROLL;
  const ca = Math.cos(roll), sa = Math.sin(roll);
  const dx = ux * ca - uy * sa;
  const dy = ux * sa + uy * ca;

  const camx = 1.1 + p * SIDEWAYS * TILE * 2;
  const camz = p * TRIPS * TILE * 2;
  const fold = FOLD + WOBBLE * Math.sin(p * Math.PI * 2);

  let s = 0.14;
  let fade = 1;
  let vr = 0, vg = 0, vb = 0;

  for (let r = 0; r < STEPS; r++) {
    let px = tile(camx + dx * s * 0.5);
    let py = tile(0.4 + dy * s * 0.5);
    let pz = tile(camz + s * 0.5);

    let a = 0;
    let pa = 0;
    for (let i = 0; i < ITER; i++) {
      // Floor the divisor rather than nudging it off zero. A point that lands
      // in the middle of a cell sends this to 1e-9, and the fold then produces
      // values so large that the next square is denormal — which is both an
      // ugly blown-out spike and, on x86, genuinely slow arithmetic.
      const d = Math.max(FLOOR, px * px + py * py + pz * pz);
      px = Math.abs(px) / d - fold;
      py = Math.abs(py) / d - fold;
      pz = Math.abs(pz) / d - fold;
      const len = Math.sqrt(px * px + py * py + pz * pz);
      a += Math.abs(len - pa);
      pa = len;
    }

    const dm = Math.max(0, DARK - a * a * 0.001);
    a = a * a * a;                        // hard gamma: mostly black, few stars
    if (r > 5) fade *= 1 - dm;

    // Depth is the palette. The three channels weight the same emission by
    // different powers of distance, so near material comes back blue-white and
    // only the far cores stay gold — which is the whole colour story, with no
    // colour lookup anywhere.
    const e = a * BRIGHT * fade;
    vr += fade * 0.02 + s * s * s * s * e * 2.6;
    vg += fade * 0.024 + s * s * e * 1.35;
    vb += fade * 0.03 + s * e;
    fade *= DISTFADE;
    s += 0.11;
  }

  // Gamma at the end, not brightness in the middle: a volumetric accumulation
  // has a long dim tail, and only a curve on the total separates star from dust.
  const r = Math.pow(vr * GAIN, GAMMA);
  const g = Math.pow(vg * GAIN, GAMMA);
  const b = Math.pow(vb * GAIN, GAMMA);
  return rgb(r * 255, g * 255, b * 255);
}
`;

const ionTunnel = `export const name = "Ion Tunnel", fps = 30, seconds = 16;

// A neon tunnel, built on the analytic tunnel mapping Inigo Quilez writes up
// here: https://iquilezles.org/articles/tunnel/
//
// Not raymarched. For a perfect infinite cylinder you
// do not need to march anything: the ray from the eye through a pixel at radius
// r hits the tube at distance 1/r, and at angle atan2(y, x) around it. So the
// whole tunnel is two lines of maths per pixel, exactly, with no stepping and
// no aliasing from too few samples. This is the oldest trick in the demoscene
// and it is still the right one.
//
// The 16:1 strip turns it into something better than a circle: scaling the
// vertical axis hard makes the vanishing point a slot rather than a dot, so the
// walls sweep past the length of the corridor instead of collapsing to a point.
//
// Loops because the camera covers TRIPS whole rings and the twist and the
// barrel roll complete whole turns, all in one show length.
const SPACING = 1;             // world units between rings
const TRIPS = 44;              // rings passed per loop
const TWISTS = 3;              // revolutions of twist along the tube, per loop
const ROLLS = 1;               // revolutions the whole tunnel rotates, per loop
const RIBS = 7;
const TWIST = ((Math.PI * 2) * TWISTS) / (TRIPS * SPACING);
const BANDS = 3;               // colour bands down the tube, per loop
const BAND = ((Math.PI * 2) * BANDS) / (TRIPS * SPACING);

export function pixel(x, y, t) {
  const ux = (x - 96) / 96;                       // -1..1 along the corridor
  const uy = (((y % 12) - 5.5) / 5.5) * 0.34;     // squashed: the slot
  const p = t / seconds;

  const r = Math.sqrt(ux * ux + uy * uy) + 1e-4;
  const depth = 1 / r + p * TRIPS * SPACING;      // distance along the tube
  const angle = Math.atan2(uy, ux) + depth * TWIST + p * Math.PI * 2 * ROLLS;

  // Rings: bright where depth crosses a ring plane, and they crowd towards the
  // vanishing point exactly as perspective says they should.
  const u = depth / SPACING;
  const toRing = Math.abs(u - Math.floor(u) - 0.5) * 2;
  const ring = (1 - toRing) ** 6;

  // Ribs running the length of the tube, twisting with it.
  const rib = 0.5 + 0.5 * Math.cos(angle * RIBS);
  const edge = rib ** 3;

  // Fog does two jobs: depth cue, and killing the aliasing at the vanishing
  // point where infinite rings would otherwise pile into one pixel.
  const fog = Math.min(1, r * 2.6) ** 1.5;
  const near = 1 / (1 + (1 / r) * 0.10);

  const glow = (0.10 + ring * 1.25 + edge * 0.55 + ring * edge * 2.2) * fog * near;

  // Colour crawls down the tube, so rings arrive in waves rather than uniform.
  const hue = 196 + 78 * Math.sin(depth * BAND * 3 + p * Math.PI * 2) + edge * 25;
  const light = Math.min(0.62, glow * 0.34);
  return hsl(hue, 0.85 - ring * 0.25, light);
}
`;

const domainWarp = `export const name = "Domain Warp", fps = 30, seconds = 28;

// Inigo Quilez's domain warping:
//   https://iquilezles.org/articles/warp/
//   https://www.shadertoy.com/view/lsl3RH
//
// Take a noise field, and instead of asking for its value at p, ask for it at p
// distorted by *another* noise field. Do it twice and flat clouds turn into
// something that looks like it is being stirred.
//
//   f(p) = fbm(p + 4 * fbm(p + 4 * fbm(p)))
//
// The noise here tiles: the lattice coordinate wraps every PERIOD units, and
// each octave doubles both the coordinate and its period. Tiling survives the
// warp — a periodic function of a periodic function is still periodic — so
// scrolling exactly one tile across the show loops the whole thing, warp and
// all. That is the only reason a field this organic can close cleanly.
//
// It also dollies. Scaling the sample coordinate zooms the field, and the loop
// survives it for a reason worth knowing: the scale multiplies, the scroll
// adds, so as long as the scale returns to exactly 1 at the end of the show,
// the last frame is still the first frame shifted by a whole tile. Any whole
// number of breaths per loop satisfies that.
const PERIOD = 6;
const BREATHS = 2;             // dolly cycles per loop
const DOLLY = 0.5;             // how far it pushes in

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const x1 = ((x0 + 1) % period);
  const a = hash(x0, yi), b = hash(x1, yi);
  const c = hash(x0, yi + 1), d = hash(x1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Three octaves, not five. At 12 pixels tall the high ones stop being detail
// and start being noise — the warp is what carries the structure here.
function fbm(x, y) {
  return noise(x, y, PERIOD) * 0.56
       + noise(x * 2, y * 2, PERIOD * 2) * 0.30
       + noise(x * 4, y * 4, PERIOD * 4) * 0.14;
}

export function pixel(x, y, t) {
  const wall = y < 12 ? 0 : 1;
  const p = t / seconds;
  // It only ever pushes *in*. Zooming out packs more field into each pixel,
  // and at 12 rows tall that stops being detail and becomes static — the same
  // reason this uses three octaves and not five. scale is 1 at both ends of the
  // show, which is what keeps the loop closed.
  const scale = 1 - DOLLY * (1 - Math.cos(p * Math.PI * 2 * BREATHS)) / 2;
  const bx = (x * 0.026 + p * PERIOD) * scale;   // one tile per loop, zoomed
  const by = ((y % 12) - 5.5) * 0.10 * scale + wall * 11;

  const qx = fbm(bx, by);
  const qy = fbm(bx + 5.2, by + 1.3);

  const rx = fbm(bx + 4 * qx + 1.7, by + 4 * qy + 9.2);
  const ry = fbm(bx + 4 * qx + 8.3, by + 4 * qy + 2.8);

  const f = fbm(bx + 4 * rx, by + 4 * ry);

  // Colour from the warp itself, not just the final value: the vectors carry
  // the structure, and mixing them is what gives the deep blue-to-gold range.
  const heat = Math.max(0, f - 0.22) * 2.6;
  const swirl = Math.abs(rx - ry) * 2.2;
  const hue = 214 + swirl * 150 - heat * 90;
  const light = heat * heat * (0.30 + swirl * 0.55);

  return hsl(hue, Math.max(0.35, 0.95 - swirl * 0.4), Math.min(0.60, light));
}
`;

const arc = `export const name = "Arc", fps = 30, seconds = 12;

// Lightning down the corridor.
//
// The bolt is a polyline whose vertices are hashed from (segment, strike), so
// it is fully deterministic — the same strike returns on every replay — and it
// re-forms STRIKES times per loop, which is what makes the flicker periodic
// rather than merely fast.
//
// The glow is 1 / distance to the nearest segment. That one line does all the
// work a blur would: a core that blows out to white where the distance goes to
// zero, and a halo that carries twenty pixels. Two branches fork off the main
// channel, hashed the same way, and a charge front sweeps the length of the
// corridor so the strike arrives rather than appearing.
const SEGMENTS = 16;
const STRIKES = 18;            // re-forms per loop
const SPAN = 192 / SEGMENTS;
const FLICKER = 96;            // flicker cycles per loop — an integer, so it wraps

function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Vertex i of a channel, anchored at both ends of the corridor so the bolt
// always spans it. \`fork\` picks the channel: 0 is the main one.
function nodeY(i, strike, wall, fork) {
  if (i <= 0) return 5.5;
  if (i >= SEGMENTS) return 5.5;
  const wander = hash(i * 13 + fork * 101 + wall * 7, strike) - 0.5;
  const main = 5.5 + wander * 9;
  if (fork === 0) return main;
  // Branches bow away from the main channel and rejoin it at both ends.
  const bow = Math.sin((i / SEGMENTS) * Math.PI) * (fork === 1 ? 3.6 : -3.6);
  return Math.max(0.5, Math.min(11.5, main + bow));
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len = vx * vx + vy * vy;
  let s = len > 0 ? (wx * vx + wy * vy) / len : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cx = ax + vx * s - px;
  const cy = ay + vy * s - py;
  return Math.sqrt(cx * cx + cy * cy);
}

export function pixel(x, y, t) {
  const row = y % 12;
  const wall = y < 12 ? 0 : 1;

  const phase = (t / seconds) * STRIKES;
  const strike = Math.floor(phase) % STRIKES;
  const life = phase - strike;                       // 0..1 through this strike

  // Flash, hold, decay — with a hashed peak so some strikes are sheet lightning
  // and some barely happen, and a fast flicker on top of the whole envelope.
  const rise = Math.min(1, life * 14);
  const decay = Math.max(0, 1 - life) ** 0.9;
  const flicker = 0.72 + 0.28 * Math.sin(t * ((Math.PI * 2) * FLICKER) / seconds);
  const power = rise * decay * flicker * (0.45 + hash(strike, 7) * 0.55);
  if (power < 0.02) return 0;

  // The charge front runs the corridor: nothing is lit ahead of it.
  const front = life * 620 - 60;
  const gate = Math.max(0, Math.min(1, (front - x) / 30));
  if (gate <= 0) return 0;

  // Only the two or three segments overlapping this column can be nearest.
  const first = Math.max(0, Math.floor(x / SPAN) - 1);
  const last = Math.min(SEGMENTS - 1, first + 2);

  let best = 99;
  let branchBest = 99;
  for (let i = first; i <= last; i++) {
    const ax = i * SPAN, bx = (i + 1) * SPAN;
    const d0 = distToSegment(x, row, ax, nodeY(i, strike, wall, 0), bx, nodeY(i + 1, strike, wall, 0));
    if (d0 < best) best = d0;
    for (let f = 1; f <= 2; f++) {
      const d = distToSegment(x, row, ax, nodeY(i, strike, wall, f), bx, nodeY(i + 1, strike, wall, f));
      if (d < branchBest) branchBest = d;
    }
  }

  const core = Math.max(0, 1 - best * 0.85) ** 1.5;
  const halo = 1 / (1 + best * best * 0.55);
  const branch = (Math.max(0, 1 - branchBest * 0.9) ** 2 * 0.85
                + 1 / (1 + branchBest * branchBest * 1.8) * 0.35)
                * (0.35 + hash(strike, 21) * 0.65);

  const v = (core * 2.2 + halo * 0.9 + branch) * power * gate;

  // White-hot core over a violet halo: the core has to clip to read as an arc.
  const r = Math.min(1, v * 0.62 + core * power * gate * 1.4);
  const g = Math.min(1, v * 0.40 + core * power * gate * 1.3);
  const b = Math.min(1, v * 1.25 + core * power * gate * 0.6);
  return rgb(r * 255, g * 255, b * 255);
}
`;

export const EXAMPLES: Example[] = [
  {
    id: "plasma",
    name: "Plasma",
    blurb: "The pixel hello-world. Vary brightness, not just hue.",
    source: plasma,
  },
  {
    id: "warp",
    name: "Warp",
    blurb: "Chevrons down the corridor — a sharp head and a long tail.",
    source: warp,
  },
  {
    id: "starfield",
    name: "Starfield",
    blurb: "The draw demo: discrete, hard-edged, stateful.",
    source: starfield,
  },
  {
    id: "twin",
    name: "Twin",
    blurb: "Two walls, deliberately different. Teaches y < 12 and y % 12.",
    source: twin,
  },
  {
    id: "warp-tunnel",
    name: "Warp Tunnel",
    blurb: "Surging chevrons. Integrates a speed curve so nothing jumps.",
    source: warpTunnel,
  },
  {
    id: "aurora",
    name: "Aurora",
    blurb: "Three octaves of tiling value noise. No Math.random.",
    source: aurora,
  },
  {
    id: "ember",
    name: "Ember",
    blurb: "Fire sideways, on a hand-rolled black-body palette.",
    source: ember,
  },
  {
    id: "interference",
    name: "Interference",
    blurb: "Two gratings beating against each other. Made for 16:1.",
    source: interference,
  },
  {
    id: "downpour",
    name: "Downpour",
    blurb: "384 hashed streaks with fading trails, all wrapping together.",
    source: rain,
  },
  {
    id: "pong",
    name: "Corridor Pong",
    blurb: "The ball changes walls at each end. Pure function of t.",
    source: pong,
  },
  {
    id: "marquee",
    name: "Marquee",
    blurb: "Real text with no assets, copied to the far wall.",
    source: marquee,
  },
  {
    id: "lattice",
    name: "Lattice",
    blurb: "Hard geometry from distance functions, with a moving highlight.",
    source: lattice,
  },
  {
    id: "hyperspace",
    name: "Hyperspace",
    blurb: "Volumetric fractal, 120 iterations a pixel. After Kali's Star Nest.",
    source: hyperspace,
  },
  {
    id: "ion-tunnel",
    name: "Ion Tunnel",
    blurb: "Raymarched neon rings, accumulating emission instead of hitting surfaces.",
    source: ionTunnel,
  },
  {
    id: "domain-warp",
    name: "Domain Warp",
    blurb: "fbm(p + fbm(p + fbm(p))) on tiling noise, so it still loops.",
    source: domainWarp,
  },
  {
    id: "arc",
    name: "Arc",
    blurb: "Lightning as 1/distance to a hashed polyline. Re-strikes 24x a loop.",
    source: arc,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
