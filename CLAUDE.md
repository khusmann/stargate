# Stargate

Authoring pipeline for a 192 x 24 LED installation driven by a Color Kinetics LSM
Gen 5. It generates `.sho` show files and the baked PNG frame sequences they
reference. The LSM handles playback, scheduling, and keypad triggering.

Hardware: 1x LSM Gen 5, 1x Antumbra Ethernet Keypad, 4x sPDS-480ca, 128x iColor
Module FX 6:36 (36 nodes each).

## Where things live

- [README.md](README.md) — how to run and use the tool.
- [DESIGN.md](DESIGN.md) — why it's built this way: architecture decisions and
  their rationale.
- [RESOURCES.md](RESOURCES.md) — the domain reference: the `.sho`/`.map` file
  formats, the half-pitch grid math, the groups/`gid` table, and the
  `resources/` index.
