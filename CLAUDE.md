Here's a complete list of my hardware: 1x LSM Gen 5 (main control unit) 1x
Antumbra Ethernet Keypad 4x sPDS 480ca (power/data handlers) 128x iColor Module
FX 6:36 (LED panels)

Goal:
Replace the Color Kinetics LSM/Light System Composer toolchain with something we can
actually maintain.

## Architecture (decided)

**A headless Go engine that serves a web UI.**

This matches the shape of the LSM Gen 5 we're replacing: a standalone always-on box
with a web interface, keypad triggering, and calendar-scheduled playback. The engine
owns the UDP socket, show clock, schedule, and keypad listener, and keeps running
whether or not anyone is logged in. The UI is just a client, so "cross-platform"
falls out for free — the app is a URL, reachable from a phone while standing in the
room.

Why Go:

- The whole engine fits in the stdlib — `net` (UDP), `net/http` (serve UI), `time`
  (show clock). Near-zero dependencies, so there is nothing to rot.
- The Go 1 compatibility promise. This hardware is 2005–2016 gear that already
  outlived its vendor's software; design for that timescale.
- `//go:embed` bakes the web UI into the binary. Deployment is `scp` of one file — no
  runtime to install on the target.

The web UI should be plain HTML/JS with **no build step**, to avoid frontend
dependency rot too. The UI is modest: canvas preview, show list, schedule editor,
keypad mapping.

## Deployment target

Raspberry Pi 4/5, static IP on the controllers' subnet (`10.4.168.x`), systemd unit
with `Restart=always`.

Headroom is large — 3.3 Mbit/s and a few million pixel-ops/sec against gigabit and a
multi-core ARM. The risks worth engineering against are operational:

- **Frame pacing.** Hold a steady 33.3 ms tick off a monotonic clock with drift
  correction, and run the output loop at elevated priority. Sloppy pacing shows up as
  stutter in scrolling content.
- **SD card wear** is the top killer of always-on Pis. Boot from USB SSD or an A2
  card, logs on tmpfs, consider read-only root.

## Scale

192 x 24 = 4,608 pixels, 30 fps. One frame is 13.8 KB; the full wall is ~415 KB/s
across 4 controllers. An entire 31 s animation as raw RGB is ~13 MB — small enough to
hold whole shows uncompressed in RAM. Bake animations to frame data ahead of time
(the existing PNG sequences in `resources/` already work this way) so the engine just
plays back pixel buffers.

See [RESOURCES.md](RESOURCES.md) for an index of the `resources/` folder — vendor
docs and software, the fixture map (4,608 pixels on a 192x24 canvas), existing
`.sho`/`.map` files and their formats, and show assets.