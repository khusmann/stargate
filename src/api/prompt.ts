/** The "Copy AI prompt" payload: everything an assistant needs to write a show
 *  that runs, and nothing else. If it stops fitting in one prompt, the API is
 *  too big — that constraint is doing real work. */

import { API_DTS } from "./api";
import { EXAMPLES } from "../examples";

const WORKED_EXAMPLE = EXAMPLES[0]!.source.trim();
const SITE_URL = "https://khusmann.github.io/stargate/";

export function buildPrompt(): string {
  return `Write a show for the Stargate LED installation.

Write the show as one self-contained JavaScript file, then **deliver it as a
clickable Stargate link, not as raw code** — encode the finished source into a
share URL (see "Delivering the show" below) and hand it back as a single
clickable link in a small markdown file. No loose explanation, no code fences
in the reply.

## The wall

A 192 x 24 pixel canvas at 30 fps. It is not a screen: it is two LED strips,
each 192 x 12, running along either side of a corridor ceiling and facing each
other across the room.

- Rows 0-11 are one wall, rows 12-23 the other.
- Nobody can see both walls as one picture, so a shape drawn across rows 10-13
  is cut in half and lands on opposite sides of the room. Never rely on it.
- Treat it as two 192 x 12 shows sharing a timeline. \`y % 12\` makes them
  identical; \`y < 12\` tells them apart.
- The canvas is 16:1 and only 12 rows tall per wall. Motion along the 192 axis
  is what reads. Radial effects, circles, and text mostly do not.
- Column 96 is a controller boundary. Nothing special to do, just do not build
  a show whose whole point is a seam there.

## The API

\`\`\`ts
${API_DTS}
\`\`\`

## Rules

- Define \`pixel\`, \`draw\`, or both. \`pixel\` runs first; \`draw\` composites on top.
- \`pixel\` must return a packed integer and must not allocate — no arrays, no
  objects, no strings. It is called about 4 million times per export.
- \`rgb\` and \`hsl\` are globals. There are no imports and no assets; a show is
  one self-contained file.
- Vary lightness, not only hue. Holding lightness at 0.5 makes every pixel
  equally bright, which looks flat and runs the whole wall at full power.
- Keep it deterministic if you can. \`Math.random()\` at module scope re-rolls on
  every edit, so the export will not match what was on screen.
- **It must loop seamlessly.** The wall replays the same \`seconds\` for hours,
  so the frame at \`t = seconds\` has to be identical to the frame at \`t = 0\`.
  Derive every frequency and speed from \`seconds\` — \`const W = Math.PI * 2 /
  seconds\` and integer multiples of it for waves, and speeds picked so a
  repeating pattern covers a whole number of repeats per show. A term like
  \`Math.sin(t * 1.3)\` or \`x - t * 90\` almost never closes; that visible jump
  every few seconds is the most common flaw in a show.

## A complete show

\`\`\`js
${WORKED_EXAMPLE}
\`\`\`

## Delivering the show

Don't print the raw JavaScript. Encode the finished source into a Stargate
share link and hand back a single clickable link (write it into a small
markdown file and present that file).

The link format is:

\`\`\`
${SITE_URL}#s=<payload>
\`\`\`

where \`<payload>\` is the show's source text, **raw**-DEFLATE-compressed and then
base64url-encoded. Node, no dependencies:

\`\`\`js
const zlib = require("zlib");
const payload = zlib.deflateRawSync(Buffer.from(source, "utf8"), { level: 9 })
  .toString("base64")
  .replace(/\\+/g, "-")
  .replace(/\\//g, "_")
  .replace(/=+$/, "");
const url = "${SITE_URL}#s=" + payload;
\`\`\`

It must be **raw** DEFLATE — \`deflateRawSync\`, not \`deflateSync\` or gzip — because
the site decompresses with fflate's raw \`inflateSync\`. Following the link opens
the show in the editor behind a *Run it / Discard* bar; nothing runs until "Run
it" is clicked, and the link never touches saved work.

Two other fragment forms exist, if useful: \`#e=<id>\` loads a bundled example by
id, and \`#new\` (or \`#reset\`) opens a clean editor, clearing saved work without
running anything — the escape hatch if a show ever freezes the tab.
`;
}
