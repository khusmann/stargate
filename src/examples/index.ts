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

const flames = `export const name = "Flames", fps = 30, seconds = 20;

// Fire read sideways: it burns along one edge of each strip and licks across
// the twelve rows. Three things make it read as fire rather than as a red band,
// and all three are geometry, not colour:
//
//   1. a silhouette — how far the flame reaches varies along the wall, so the
//      top edge is jagged and every lick has its own height,
//   2. a soft tip — EDGE rows of fade at the top, so licks dissolve instead of
//      being cut off, and
//   3. churn that climbs — a second field advected across the strip at RISE,
//      which is what carries the eye upward.
//
// Nothing is stepped. Flicker by re-hashing a lattice a few times a second is
// what makes a fire shader jitter; here every time term is a smooth noise
// coordinate, so the motion is continuous at any fps.
//
// The loop closes because both fields tile in both axes and every shift covers
// a whole number of periods in \`seconds\`:
//
//   drift    WIND * seconds / CELL = 60 = 2 * PU
//   flicker  FLICK * seconds       = 60 = 4 * PT
//   drift    WIND * seconds / TX   = 60 = 3 * TPX
//   climb    RISE * seconds / TY   = 20 = 2 * TPY
//
// Every octave doubles its coordinate *and* its period, so the doubled octaves
// tile on the same shifts. Retune anything above and re-check all four.
const RISE = 16;      // rows/s the churn climbs across the strip
const WIND = 18;      // px/s the whole fire drifts along the wall
const FLICK = 3;      // silhouette flicker, in noise cells per second
const EDGE = 2.2;     // rows of soft tip

const CELL = 6;                 // silhouette cell, px along the wall
const PU = 30, PT = 15;         // and its periods, in cells
const TX = 6, TY = 16;          // churn cell: px along the wall x rows across
const TPX = 20, TPY = 10;

// Fire is not a hue sweep, it is a black-body ramp — hsl() cannot do this, and
// linear channel ramps land on a washed-out yellow. Stops, interpolated.
const STOPS = [
  [0.00, 0, 0, 0],
  [0.13, 60, 0, 0],
  [0.36, 180, 26, 0],
  [0.62, 255, 105, 6],
  [0.84, 255, 195, 55],
  [1.00, 255, 236, 168],
];

function fire(v) {
  let i = 1;
  while (i < STOPS.length - 1 && v > STOPS[i][0]) i++;
  const a = STOPS[i - 1], b = STOPS[i];
  const f = (v - a[0]) / (b[0] - a[0]);
  return rgb(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
}

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function wrap(v, p) {
  return ((v % p) + p) % p;
}

// Value noise that tiles in *both* axes, so any constant offset still closes —
// which is what lets the two walls share one field at different offsets.
function noise(x, y, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);               // smoothstep, not lerp:
  const w = fy * fy * (3 - 2 * fy);               // kills the grid artefacts
  const x0 = wrap(xi, px), x1 = wrap(xi + 1, px);
  const y0 = wrap(yi, py), y1 = wrap(yi + 1, py);
  const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

export function pixel(x, y, t) {
  const row = y % 12;                             // 0 is the burning edge
  const seed = y < 12 ? 0 : 53.5;                 // two fires, not one twice
  const drift = x + WIND * t;

  // The silhouette. The second octave is what breaks the top edge into licks a
  // few pixels wide instead of one rolling hill.
  const u = drift / CELL + seed;
  const v = t * FLICK;
  const hN = noise(u, v, PU, PT) * 0.6 + noise(u * 2, v * 2, PU * 2, PT * 2) * 0.4;
  const h = 0.8 + hN * 12;                        // rows this lick reaches

  const tip = Math.min(1, (h - row) / EDGE);
  if (tip <= 0) return 0;                         // above the flame, nothing

  // The churn, sampled in the frame it is moving in: row - RISE * t climbs.
  const climb = (row - RISE * t) / TY;
  const tex = noise(drift / TX + seed, climb, TPX, TPY) * 0.62
            + noise((drift / TX) * 2 + seed, climb * 2, TPX * 2, TPY * 2) * 0.38;

  const cool = Math.exp(-row / 7);                // hottest at the bed
  const churn = 0.4 + 1.3 * (tex - 0.42);         // centred, then stretched
  const heat = tip * cool * churn * (0.72 + 0.5 * hN) * 1.5;
  return fire(heat > 1 ? 1 : heat < 0 ? 0 : heat);
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
const TRIPS = 13;              // tiles travelled per loop — any integer works,
                               // and this is the flythrough speed: 13 tiles in
                               // 28 s is about a tile every two seconds
const STEPS = 10;              // volumetric samples along each ray
const ITER = 12;               // fractal folds per sample
const FOLD = 0.53;
const WOBBLE = 0.035;          // how much the fractal itself morphs, per loop
const SIDEWAYS = 4;            // tiles of drift across the field, per loop
const ROLL = 1;                // turns the ray tumbles, per loop
const FLOOR = 0.02;            // smallest divisor in the fold — see below
const ZOOM = 0.78;
const BRIGHT = 0.0026;
const DISTFADE = 0.76;
const DARK = 0.30;
const GAIN = 0.044;            // the whole accumulation is scaled once, at the end
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

const fluid = `export const name = "Fluid", fps = 30, seconds = 48;

// A fluid, without a fluid simulation.
//
// A real solver needs state: a velocity field advected from the frame before,
// which a pure \\\`pixel(x, y, t)\\\` cannot hold and which would not survive
// scrubbing backwards. So this fakes the part you can actually see. Curl noise
// gives a divergence-free velocity field — take a scalar field and rotate its
// gradient 90 degrees, and the result has no sources or sinks anywhere, which
// is exactly the property that makes smoke look like smoke rather than like
// something being sprayed.
//
// Then instead of advecting dye forward, each pixel traces its own path
// *backwards* through that field and samples the dye where it came from. Four
// steps of that is enough to read as flow, it needs no memory between frames,
// and it stays a pure function of t — so the loop still closes.
const PERIOD = 8;
const STEPS = 4;
const STEP = 0.55;
const SWIRL = 2.6;
// Doubling the show length would halve every speed, so the rates are given per
// loop rather than per second: two tiles of drift and six passes of dye, the
// same motion as before over twice the time. The colour is the one thing that
// does get slower — one full turn of the wheel across the whole show, which is
// only worth doing on a show this long.
const DRIFT = 2;              // tiles the flow field travels, per loop
const PASSES = 6;             // times the dye pattern comes round, per loop
const HUES = 1;               // full rotations of the colour wheel, per loop

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
  const x1 = (x0 + 1) % period;
  const a = hash(x0, yi), b = hash(x1, yi);
  const c = hash(x0, yi + 1), d = hash(x1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y) {
  return noise(x, y, PERIOD) * 0.6 + noise(x * 2, y * 2, PERIOD * 2) * 0.4;
}

// The stream function. Velocity is its gradient, rotated: (dF/dy, -dF/dx).
function stream(x, y, p) {
  return fbm(x * 0.055 + p * PERIOD * DRIFT, y * 0.16);
}

export function pixel(x, y, t) {
  const wall = y < 12 ? 0 : 1;
  const p = t / seconds;
  let px = x;
  let py = (y % 12) + wall * 40;

  // Walk backwards along the flow, gathering where this pixel came from.
  for (let i = 0; i < STEPS; i++) {
    const e = 0.9;
    const f0 = stream(px, py, p);
    const vx = (stream(px, py + e, p) - f0) / e;
    const vy = -(stream(px + e, py, p) - f0) / e;
    px -= vx * SWIRL * STEP * 30;
    py -= vy * SWIRL * STEP * 30;
  }

  // The dye: bands that the flow shears into filaments and folds back together.
  const dye = 0.5 + 0.5 * Math.sin(px * 0.09 - p * Math.PI * 2 * PASSES + py * 0.22);
  const density = dye * dye;

  // Speed at the sample point tints it — fast water runs pale, slow runs deep.
  const speed = Math.min(1, Math.abs(px - x) * 0.05 + Math.abs(py - ((y % 12) + wall * 40)) * 0.08);

  const hue = 186 + speed * 90 - density * 40 + p * 360 * HUES;
  return hsl(hue, 0.85 - speed * 0.35, Math.min(0.6, density * 0.5 + speed * 0.14));
}
`;

const pacman = `export const name = "Pac-Man", fps = 30, seconds = 24;

// The wall's own history: the show this installation was built to run was a
// Pac-Man chase, hand-rendered to 937 PNG frames off a video. This is the same
// idea as thirty lines of code that can never lose track of which folder it is.
//
// Both walls run the corridor, in opposite directions and out of step, so the
// chase passes you going one way and comes back the other.
const DOTS = 8;               // pixels between pellets
const LAP = 24;               // seconds for one length of the room
const CHOMP = 6;              // bites per second
// Everything that wobbles has to complete whole cycles per loop, or the show
// seams — the ghosts jump and the frightened flash restarts.
const SCARE = ((Math.PI * 2) / seconds) * 3;
const BOB = ((Math.PI * 2) / seconds) * 7;

function ghost(ctx, x, top, colour, scared) {
  ctx.fillStyle = scared ? "#2121de" : colour;
  ctx.fillRect(x + 1, top + 2, 5, 6);      // body
  ctx.fillRect(x, top + 3, 7, 5);
  ctx.fillRect(x, top + 8, 1, 1);          // skirt
  ctx.fillRect(x + 2, top + 8, 1, 1);
  ctx.fillRect(x + 4, top + 8, 1, 1);
  ctx.fillRect(x + 6, top + 8, 1, 1);
  ctx.fillStyle = "#fff";                  // eyes
  ctx.fillRect(x + 1, top + 4, 2, 2);
  ctx.fillRect(x + 4, top + 4, 2, 2);
  ctx.fillStyle = scared ? "#fff" : "#2121de";
  ctx.fillRect(x + 2, top + 5, 1, 1);
  ctx.fillRect(x + 5, top + 5, 1, 1);
}

function pac(ctx, x, top, t, dir) {
  // The mouth is a wedge cut out of a disc, which is one arc and one lineTo —
  // the case \\\`draw\\\` exists for, and miserable to express as a shader.
  const open = Math.abs(Math.sin(t * Math.PI * CHOMP)) * 0.72;
  const facing = dir > 0 ? 0 : Math.PI;      // the mouth leads the way he goes
  ctx.fillStyle = "#ffd400";
  ctx.beginPath();
  ctx.moveTo(x + 4, top + 5);
  ctx.arc(x + 4, top + 5, 4.2, facing + open, facing - open + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

export function draw(ctx, t) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 192, 24);

  for (let wall = 0; wall < 2; wall++) {
    const top = wall * 12;
    // Opposite directions, and the far wall runs half a lap behind.
    const phase = (t / LAP + wall * 0.5) % 1;
    const forward = wall === 0;
    const lead = forward ? phase * 232 - 20 : 212 - phase * 232;

    // Pellets, eaten as he passes: a pellet is gone once he is past it.
    ctx.fillStyle = "#ffb897";
    for (let x = DOTS / 2; x < 192; x += DOTS) {
      const eaten = forward ? x < lead + 2 : x > lead + 6;
      if (eaten) continue;
      const big = x % (DOTS * 6) < DOTS / 2;
      if (big) ctx.fillRect(x - 1, top + 4, 3, 3);
      else ctx.fillRect(x, top + 5, 1, 1);
    }

    pac(ctx, lead, top, t, forward ? 1 : -1);

    // Four ghosts in a queue behind him, closing and falling back.
    const colours = ["#ff0000", "#ffb8ff", "#00ffff", "#ffb851"];
    const scared = Math.sin(SCARE * t + wall) > 0.55;
    for (let i = 0; i < 4; i++) {
      const gap = 11 + i * 9 + Math.sin(BOB * t + i * 1.3 + wall) * 2.5;
      ghost(ctx, forward ? lead - gap : lead + gap, top, colours[i], scared);
    }
  }
}
`;

const tumbler = `export const name = "Tumbler", fps = 30, seconds = 20;

// Solid objects, with surfaces that face a direction and catch a light.
//
// The other three-dimensional shows here are projections: the tunnel is an
// analytic mapping, the fractal is fog accumulated along a ray. Nothing in
// either has a *surface*. This one sphere-traces a scene and shades what it
// hits, which is the whole of real-time 3D minus the hardware.
//
// Sphere tracing: map() returns a lower bound on the distance from a point to
// the nearest surface, so a ray can jump exactly that far knowing it cannot
// pass through anything. Repeat, and it converges on the first hit in a few
// dozen steps — no triangles, no depth buffer, and an infinite lattice of
// cubes costs the same as one cube, because the lattice is a modulo.
//
// Once you have the hit point, the normal is the gradient of that same
// distance field — four extra samples — and once you have a normal you have
// diffuse, specular, and rim, which is everything that makes a shape read as
// solid rather than as a bright patch.
//
// The camera is where this differs from the tunnel and the fractal. Those two
// squash the vertical field of view hard, which turns the strip into a slot and
// is exactly right for something with no real scale. Cubes have a scale: stretch
// the vertical axis and every cube renders as a plank. So the frustum here is
// the wall's own 16:1 aspect ratio, near enough — FOVX / FOVY ≈ 15 — and the
// strip stops being a squashed picture and becomes a genuinely wide one. Things
// pass above and below the frame the way they would out of a car window.
const CX = 6.6;                // lattice spacing across the corridor
const CZ = 2.9;                // ... and along it
const FILL = 0.66;             // fraction of cells holding a cube — the empty
                               // ones are what put black between the objects
const TRIPS = 14;              // cells flown per loop — an integer, so the
                               // field is back where it started at the wrap
const YAWS = 3;                // whole turns of yaw per loop
const PITCHES = 2;             // ... and of pitch
const ORBITS = 2;              // laps of the lamp around the camera, per loop
const SIZE = 0.5;              // cube half-extent, before the per-cube scaling
const ROUND = 0.12;
const BIGGEST = SIZE * 1.4 + ROUND;
const CLEAR = Math.min(CX, CZ) / 2 - BIGGEST;   // see map()
const STEPS = 64;
const HIT = 0.006;
const FAR = 42;
const FOVX = 1.7;
const FOVY = 0.115;
const LANE = CX / 2;           // the camera flies down the gap between columns
const LAG = 0.5;               // the far wall is half a lap behind
const KX = -0.39, KY = 0.78, KZ = -0.49;        // key light, unit, from behind

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Blinn-Phong: brightness of the highlight from a light along (lx, ly, lz).
// The halfway vector between the light and the eye — and the eye direction is
// -r, since r points away from the camera.
function blinn(nx, ny, nz, rx, ry, rz, lx, ly, lz, power) {
  const wx = lx - rx, wy = ly - ry, wz = lz - rz;
  const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-6;
  return Math.max(0, (nx * wx + ny * wy + nz * wz) / wl) ** power;
}

// Distance to the nearest cube. Called ~70 times per pixel, so it is written
// flat and allocates nothing — this one function is the entire frame budget.
function map(px, py, pz, ca, sa, cb, sb) {
  // Fold all of space into one cell. Rounding rather than flooring keeps the
  // cell centred on the object, so the point stays near the thing it is
  // measuring the distance to.
  const ix = Math.round(px / CX);
  const iz = Math.round(pz / CZ);
  const izw = ((iz % TRIPS) + TRIPS) % TRIPS;   // period TRIPS: the loop

  // Two decorrelated values from one hash — a second imul chain per step is
  // real money at this call count.
  const h = hash(ix, izw);
  const g = (h * 7919) % 1;

  const lx = px - ix * CX;
  const lz = pz - iz * CZ;

  // Folding space is a lie, and this is the line that makes it honest. The box
  // distance below only accounts for *this* cell's cube; a point near a cell
  // wall may be closer to the next one along, and a ray that trusts the larger
  // number tunnels straight through it. But every cube is at least CLEAR inside
  // its own cell, so nothing outside this cell can be nearer than the distance
  // to the cell wall plus CLEAR. Take the smaller of the two and the bound is
  // true everywhere — no fudge factor on the step size, and empty cells are
  // crossed in one jump instead of a hundred.
  const bound = Math.min(CX / 2 - Math.abs(lx), CZ / 2 - Math.abs(lz)) + CLEAR;
  if (g > FILL) return bound;

  // Yaw then pitch, with the sin negated on alternate cells so neighbours
  // tumble opposite ways. The angles are the same for every cube, which is the
  // point: their sines are computed once per pixel instead of once per step.
  const ly = py - (h - 0.5) * 1.8;              // cubes hang at different heights
  const s = (ix + izw) & 1 ? -sa : sa;
  const ax = lx * ca - lz * s;
  const az = lx * s + lz * ca;
  const by = ly * cb - az * sb;
  const bz = ly * sb + az * cb;

  // Rounded box, exact: distance outside the slab intersection, plus the
  // negative interior term, minus the corner radius.
  const size = SIZE * (0.65 + (g / FILL) * 0.75);
  const qx = Math.abs(ax) - size;
  const qy = Math.abs(by) - size;
  const qz = Math.abs(bz) - size;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  const box = Math.sqrt(ox * ox + oy * oy + oz * oz)
            + Math.min(Math.max(qx, Math.max(qy, qz)), 0)
            - ROUND;
  return Math.min(box, bound);
}

export function pixel(x, y, t) {
  const wall = y < 12 ? 0 : 1;
  const p = t / seconds;

  // Unit ray through this pixel. Unit matters: sphere tracing advances by a
  // distance in world units, and a direction longer than 1 oversteps surfaces.
  const ux = (x - 95.5) / 96;
  const uy = ((y % 12) - 5.5) / 5.5;
  let rx = ux * FOVX, ry = uy * FOVY, rz = 1;
  const rl = Math.sqrt(rx * rx + ry * ry + 1);
  rx /= rl; ry /= rl; rz /= rl;

  // Both walls fly the same corridor, half a lap apart, so the cube that just
  // swept past you on one side is arriving on the other.
  const camx = LANE;
  const camz = (p + wall * LAG) * TRIPS * CZ;

  const yaw = p * Math.PI * 2 * YAWS;
  const pitch = p * Math.PI * 2 * PITCHES;
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const cb = Math.cos(pitch), sb = Math.sin(pitch);

  // A lamp orbiting the camera, whole laps per loop. A light fixed to the
  // camera would light every cube identically; this one rakes across them.
  const phi = p * Math.PI * 2 * ORBITS;
  const lampx = camx + Math.cos(phi) * 3.2;
  const lampy = Math.sin(phi) * 1.6;
  const lampz = camz + 2.5;

  // The march. Jump the full distance every time — the bound in map() is a real
  // one — and stop when the step gets small enough to call it a surface.
  let d = 0.05;
  let hit = -1;
  let closest = 9;
  let closeAt = FAR;
  for (let i = 0; i < STEPS; i++) {
    const s = map(camx + rx * d, ry * d, camz + rz * d, ca, sa, cb, sb);
    if (s < closest) { closest = s; closeAt = d; }
    if (s < HIT) { hit = d; break; }
    d += s;
    if (d > FAR) break;
  }

  let r = 0, g = 0, b = 0;

  if (hit >= 0) {
    // Where it landed. The camera sits at y = 0, which is why that term is bare.
    const hx = camx + rx * hit, hy = ry * hit, hz = camz + rz * hit;

    // The normal is the gradient of the field. Four taps on a tetrahedron
    // rather than six on the axes — same answer, two fewer evaluations.
    const e = 0.008;
    const d1 = map(hx + e, hy - e, hz - e, ca, sa, cb, sb);
    const d2 = map(hx - e, hy - e, hz + e, ca, sa, cb, sb);
    const d3 = map(hx - e, hy + e, hz - e, ca, sa, cb, sb);
    const d4 = map(hx + e, hy + e, hz + e, ca, sa, cb, sb);
    let nx = d1 - d2 - d3 + d4;
    let ny = -d1 - d2 + d3 + d4;
    let nz = -d1 + d2 - d3 + d4;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9;
    nx /= nl; ny /= nl; nz /= nl;

    // Two lights, doing two different jobs. The key is directional, so it does
    // not fall off and a cube stays legible however far down the corridor it
    // is; the lamp is a point light that only reaches the near ones, which is
    // what makes a cube brighten as it arrives.
    let lx = lampx - hx, ly = lampy - hy, lz = lampz - hz;
    const ld = Math.sqrt(lx * lx + ly * ly + lz * lz) + 1e-6;
    lx /= ld; ly /= ld; lz /= ld;
    const atten = 1 / (1 + ld * ld * 0.05);

    const keyDiff = Math.max(0, nx * KX + ny * KY + nz * KZ);
    const lampDiff = Math.max(0, nx * lx + ny * ly + nz * lz) * atten;

    const keySpec = blinn(nx, ny, nz, rx, ry, rz, KX, KY, KZ, 30);
    const lampSpec = blinn(nx, ny, nz, rx, ry, rz, lx, ly, lz, 44) * atten;

    // Rim: surfaces turned away from the eye. On a wall made of LEDs this is
    // what actually draws the silhouette — a lit edge reads as an edge where a
    // shaded face does not.
    const rim = (1 - Math.max(0, -(nx * rx + ny * ry + nz * rz))) ** 3;
    const fog = Math.exp(-hit * 0.065);

    // Body colour per cube from the same hash the geometry uses, so a cube
    // keeps its colour all the way down the corridor. hsl() picks the hue, and
    // everything else is added on top in rgb — a highlight is the colour of the
    // light, not a brighter body, and tinting it with the body colour is the
    // classic way to make everything look like plastic.
    const cell = hash(Math.round(hx / CX), ((Math.round(hz / CZ) % TRIPS) + TRIPS) % TRIPS);
    const base = hsl(188 + cell * 104, 0.85, 0.5);
    const cr = ((base >> 16) & 255) / 255;
    const cg = ((base >> 8) & 255) / 255;
    const cb2 = (base & 255) / 255;

    // The bodies are cool and the lamp is warm, so a highlight reads as a
    // highlight rather than as a brighter cube.
    const lit = keyDiff * 0.95 + lampDiff * 1.8 + 0.08 + 0.12 * Math.max(0, ny);
    r = (cr * lit + keySpec * 0.5 + lampSpec * 2 + rim * 0.1) * fog;
    g = (cg * lit + keySpec * 0.5 + lampSpec * 1.75 + rim * 0.16) * fog;
    b = (cb2 * lit + keySpec * 0.55 + lampSpec * 1.3 + rim * 0.24) * fog;
  } else {
    // Missed rays are not wasted: how close the ray came is a free soft halo,
    // which keeps a silhouette from stepping hard from lit to black at twelve
    // pixels tall. Faded by the depth it came closest at, or the far end of the
    // corridor draws itself as a field of outlines.
    const halo = Math.exp(-closeAt * 0.16) / (1 + closest * closest * 30);
    r = halo * 0.1;
    g = halo * 0.17;
    b = halo * 0.3;
  }

  return rgb(r * 255, g * 255, b * 255);
}
`;

const colonnade = `export const name = "Colonnade", fps = 30, seconds = 20;

// Actual 3D, rather than a pattern that suggests it: rays are intersected with
// solid matter and the surface they land on is shaded from its own normal. That
// is what buys the things a screen-space effect cannot fake — pillars occluding
// each other, a highlight crawling across a face as you pass it, edges that go
// dark because they are turned away from the light.
//
// Three decisions make a 16:1 strip twelve rows tall the right screen for it.
//
// The lens is cylindrical: the ray for column x leaves the eye at angle theta,
// not through a flat film plane. A flat 143-degree lens would smear the pillars
// at the ends of the wall into unreadable wedges — the tangent runs away — while
// a panoramic one sweeps them past at a constant rate the whole way across.
//
// The subject is architecture, so it is vertical. Pillars running floor to
// ceiling still read when they are four pixels wide; anything compact does not.
//
// And the two strips are one flight looking opposite ways — forward down the
// corridor on one wall, back the way you came on the other. That is a rotation
// of the camera (both x and z negate), never a mirror of the image: the exporter
// owns the physical reversal, and mirroring here would fight it. It is also the
// honest answer to two walls nobody can see at once — not one picture cut in
// half, but two windows out of the same moving room.
//
// It loops because the eye advances CELLS whole cells and the scene is exactly
// periodic in z with period SPACING, so the last frame is flying through the
// same geometry as the first; sway, bob, lamp pulse and hue are whole cycles.
const TAU = Math.PI * 2;
const SPACING = 4;             // world units between pillars
const CELLS = 24;              // pillars passed per loop — the loop condition
const HALL = 2.6;              // pillars stand at |x| = HALL
const PILLAR = 0.5;            // half-thickness
const ROUND = 0.1;
const OUTER = 4;               // side walls behind the colonnade
const FLOOR = -1.6;
const CEIL = 2.4;
const STRIP = 1.15;            // the two ceiling light strips, at |x| = STRIP
const HFOV = 1.25;             // horizontal half-angle: 143 degrees across
const VFOV = 0.5;              // vertical, as a slope rather than an angle
const STEPS = 40;
const FAR = 44;

function box(px, py, pz, hx, hy, hz) {
  const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0), az = Math.max(qz, 0);
  const outside = Math.sqrt(ax * ax + ay * ay + az * az);
  return outside + Math.min(Math.max(qx, qy, qz), 0) - ROUND;
}

// The whole colonnade, as a distance. Two folds do all the work: Math.abs on x
// turns one pillar into a matched pair, and the modulo on z turns that pair into
// an endless row. Both are exact here — the pillar sits centred in its cell, so
// the nearest copy is always the one in the cell you are standing in, which is
// what makes it safe to march at full step length.
function map(px, py, pz) {
  const mz = pz - Math.floor(pz / SPACING) * SPACING - SPACING / 2;
  const pillar = box(Math.abs(px) - HALL, py - (FLOOR + CEIL) / 2, mz,
                     PILLAR, (CEIL - FLOOR) / 2, PILLAR);
  return Math.min(pillar, OUTER - Math.abs(px));
}

export function pixel(x, y, t) {
  const p = t / seconds;
  const row = y % 12;
  const back = y >= 12;

  // The light is the ceiling strips, and they are the only light: everything
  // here is lit by two lines running the length of the corridor, which is what
  // the room this plays in actually looks like. The colour turns once per loop.
  const hue = p * TAU;
  const lr = 0.58 + 0.42 * Math.sin(hue);
  const lg = 0.58 + 0.42 * Math.sin(hue + 2.0944);
  const lb = 0.58 + 0.42 * Math.sin(hue + 4.1888);

  // Sway and bob at two and three cycles: enough that it reads as a camera
  // carried down the corridor rather than a slide on a rail.
  const ex = Math.sin(p * TAU * 2) * 0.3;
  const ey = Math.sin(p * TAU * 3) * 0.12;
  const ez = p * CELLS * SPACING;

  let dx = Math.sin(((x - 95.5) / 96) * HFOV);
  let dz = Math.cos(((x - 95.5) / 96) * HFOV);
  let dy = -((row - 5.5) / 5.5) * VFOV;
  const inv = 1 / Math.sqrt(1 + dy * dy);      // dx*dx + dz*dz is already 1
  dx *= inv; dy *= inv; dz *= inv;
  if (back) { dx = -dx; dz = -dz; }

  // Floor and ceiling are solved, not marched. A ray nearly parallel to a plane
  // is the one case sphere tracing handles badly — the steps go to nothing and
  // it stalls short of the surface, which on a strip this shallow would eat the
  // horizon, where most of the depth lives. One divide gives the exact hit.
  const up = dy > 0;
  let plane = FAR;
  if (dy < -1e-3) plane = (FLOOR - ey) / dy;
  else if (dy > 1e-3) plane = (CEIL - ey) / dy;
  if (plane > FAR) plane = FAR;

  let s = 0.02;
  let hit = false;
  for (let i = 0; i < STEPS; i++) {
    const d = map(ex + dx * s, ey + dy * s, ez + dz * s);
    if (d < 0.002 + s * 0.001) { hit = true; break; }   // epsilon grows with
    s += d;                                             // distance: a far
    if (s >= plane) break;                              // surface is subpixel
  }

  let r = 0, g = 0, b = 0;
  const dist = hit ? s : plane;

  if (hit) {
    const px = ex + dx * s, py = ey + dy * s, pz = ez + dz * s;

    // Normal from four taps of the field rather than six. The tetrahedron
    // trick: sample at the corners of a tetrahedron and the offsets themselves
    // are the basis, so the gradient falls out of one weighted sum.
    const h = 0.008;
    const d1 = map(px + h, py - h, pz - h);
    const d2 = map(px - h, py - h, pz + h);
    const d3 = map(px - h, py + h, pz - h);
    const d4 = map(px + h, py + h, pz + h);
    let nx = d1 - d2 - d3 + d4;
    let ny = -d1 - d2 + d3 + d4;
    let nz = -d1 + d2 - d3 + d4;
    const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= nl; ny *= nl; nz *= nl;

    // Nearest point on the nearest strip is straight across in z, so the light
    // vector is a two-dimensional problem: the strips are infinite lines.
    let lx = (px > 0 ? STRIP : -STRIP) - px;
    let ly = CEIL - py;
    const r2 = lx * lx + ly * ly;
    const li = 1 / Math.sqrt(r2);
    lx *= li; ly *= li;

    const fall = 1 / (1 + r2 * 0.12);
    const diff = Math.max(0, nx * lx + ny * ly) * fall;

    let hx = lx - dx, hy = ly - dy, hz = -dz;
    const hi = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
    const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) * hi), 24) * fall;

    // Rim light. At four pixels wide a pillar is mostly silhouette, and the one
    // term that draws a silhouette is the one that peaks where the surface turns
    // away from the eye.
    const rim = Math.pow(Math.max(0, 1 + nx * dx + ny * dy + nz * dz), 3);

    const wall = OUTER - Math.abs(px) < 0.05;
    const albedo = wall ? 0.16 : 0.42;
    const pulse = 0.65 + 0.35 * Math.sin(pz * TAU / 16);
    const v = albedo * (0.05 + diff * 1.5 * pulse) + spec * 0.7 * pulse + rim * 0.16;
    r = v * lr; g = v * lg; b = v * lb;
  } else if (plane < FAR) {
    const px = ex + dx * plane, pz = ez + dz * plane;
    const off = Math.abs(Math.abs(px) - STRIP);
    const pulse = 0.65 + 0.35 * Math.sin(pz * TAU / 16);

    if (up) {
      // The strips themselves: a hot core and a wide halo standing in for the
      // bloom a real lens would add. They converge on the vanishing point, which
      // is the strongest perspective cue in the frame.
      const core = Math.max(0, 1 - off / 0.13);
      const halo = 1 / (1 + (off / 0.5) * (off / 0.5));
      const v = 0.02 + (core * core * 2.4 + halo * 0.4) * pulse;
      r = v * lr; g = v * lg; b = v * lb;
    } else {
      // Floor: two pools of light under the strips, and lines across it every
      // half cell. The lines widen with distance — a fixed-width line thinner
      // than a pixel aliases into a dashed mess, and this wall has few enough
      // pixels that it would be the first thing you noticed.
      const lane = 1 / (1 + (off / 0.85) * (off / 0.85));
      const f = pz / 2 - Math.floor(pz / 2);
      const edge = Math.min(f, 1 - f);
      const w = 0.02 + plane * 0.004;
      const line = Math.max(0, 1 - edge / w);
      const v = 0.02 + lane * 0.5 * pulse + line * 0.18;
      r = v * lr; g = v * lg; b = v * lb;
    }
  }

  // Fog in the lamp colour, so the far end of the corridor glows instead of
  // going black — and so the horizon, where the geometry gets subpixel, fades
  // out before it can shimmer.
  const fog = 1 - Math.exp(-dist * 0.085);
  r = r * (1 - fog) + lr * 0.05 * fog;
  g = g * (1 - fog) + lg * 0.05 * fog;
  b = b * (1 - fog) + lb * 0.05 * fog;

  return rgb(
    Math.min(1, r) ** 0.85 * 255,
    Math.min(1, g) ** 0.85 * 255,
    Math.min(1, b) ** 0.85 * 255,
  );
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
    id: "flames",
    name: "Flames",
    blurb: "Fire sideways: a jagged silhouette, soft tips, churn that climbs.",
    source: flames,
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
    id: "arc",
    name: "Arc",
    blurb: "Lightning as 1/distance to a hashed polyline. Re-strikes 24x a loop.",
    source: arc,
  },
  {
    id: "pacman",
    name: "Pac-Man",
    blurb: "The show this wall was built for, as thirty lines instead of 937 PNGs.",
    source: pacman,
  },
  {
    id: "lattice",
    name: "Lattice",
    blurb: "Hard geometry from distance functions, with a moving highlight.",
    source: lattice,
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
    id: "hyperspace",
    name: "Hyperspace",
    blurb: "Volumetric fractal, 120 iterations a pixel. After Kali's Star Nest.",
    source: hyperspace,
  },
  {
    id: "fluid",
    name: "Fluid",
    blurb: "Curl noise plus backward advection — flow with no state to store.",
    source: fluid,
  },
  {
    id: "tumbler",
    name: "Tumbler",
    blurb: "Sphere-traced cubes with real normals — diffuse, specular, rim, fog.",
    source: tumbler,
  },
  {
    id: "colonnade",
    name: "Colonnade",
    blurb: "Raymarched solids with real normals and lights. Forward on one wall, back the way you came on the other.",
    source: colonnade,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
