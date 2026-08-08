# Stargate test pattern

A short test show for the wall. It answers four questions we can't answer from the
files alone, and it should take about ten minutes at the LSC machine.

It's an 18 second loop of 9 patterns, 2 seconds each. There are two `.sho` files that
are **identical except for one setting** — play both and compare.

## Setup

1. Copy the `Stargate Test` folder to:

   ```
   G:/My Drive/Fuse Live Arts/Artwork/Stargate/Shows/Stargate Test/
   ```

   so that the frames end up at `.../Stargate Test/frames/test-00001.png` and so on.
   If it has to go somewhere else, open the `.sho` in a text editor and fix the
   `<animationdir>` line to match — that's expected, and knowing whether that edit
   works is itself one of the things we're testing.

2. Load `Stargate Test (smooth 0).sho` in Light System Composer and play it.

3. Then load `Stargate Test (smooth 1).sho` and play that.

## What to look for

**If the show won't load or import at all, stop there — that by itself is the most
useful thing you could tell us.**

Otherwise, here's the loop in order. Photos of anything interesting are ideal; the
patterns at 8–14 s are the ones where a photo really helps.

| Time | Pattern | What we're asking |
|---|---|---|
| 0–2 s | all off | nothing lit? |
| 2–4 s | whole wall dim white | does *everything* light up — both strips, full length? any dead sections? |
| 4–6 s | one end white, other end red | **which end of the corridor is the white end?** |
| 6–8 s | one strip green, other blue | **which side of the room is the green strip?** |
| 8–10 s | fine vertical stripes | **crisp stripes, or a flat grey wash?** |
| 10–12 s | fine horizontal stripes | same question — crisp, or washed out? |
| 12–14 s | fine checkerboard | same question. this is the harshest one |
| 14–16 s | 4 corner dots + 1 red centre dot | are all five visible? are the dots exactly at the corners? |
| 16–18 s | 8 grey steps, dark to bright | do you count 8 distinct steps, or do the bright ones blur together? |

## The important one

The three stripe patterns (8–14 s) are the whole reason for the two files.

- With **smooth 0** they should be sharp, single-pixel stripes.
- With **smooth 1** they may go soft or wash out to flat grey.

If both files look the same, tell us that too — it's just as informative.

## What to send back

1. Did it load? Did you have to edit the path?
2. Which end was white, and which side of the room was green? (a photo of each is
   perfect)
3. For each of the two files: were the stripes crisp or washed out?
4. Anything that looked broken, dead, or backwards.

That's it. Thank you — this unblocks basically everything else.
