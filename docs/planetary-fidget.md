# Planetary fidget spinner

A hand-held planetary gear set on 625 bearings (5 x 16 x 5). Hold the frame and turn the
sun with a thumb: three planets roll round inside the ring and the carrier under them turns
at a quarter of the sun's speed (4:1 with the ring held). Push a planet round instead and
the sun whips round four times as fast.

Script: `cad/planetary_fidget.py` (run inside Blender, PrecisionGears add-on for the teeth;
it reuses the helpers and the bearing seats of `cad/gear_toys.py`). `build(save)` makes the
parts in their print poses (collection `Planetary Fidget`) and the assembly
(`Planetary Fidget Assembly`), `check()` runs the checks below, `export(out_dir)` writes
the STLs to `cad/export/planetary_fidget/`. File: `cad/planetary_fidget.blend`.

## Gears

Module 2, 25 deg pressure angle. Sun 15T, three planets 15T, ring 45T: (15 + 45) / 3 = 20,
so the planets sit evenly 120 apart and every one meshes both ways. Sun to planet axis 30.
The sun and the planets are the same part. Each sun / planet flank is thinned 0.1 at the
pitch circle; each ring space is widened another 0.05 (it prints as a hole, which comes out
small).

The ring is cut with an external 45T "cutter": its teeth are the ring's spaces (tip 47.5,
the ring's root; root 43, the ring's tips). Two copies turned slightly apart widen the
spaces.

## How it fits together

Assembly z from the frame plate's top face (0); everything is 32 tall above it and the
plate is 5 thick, so the toy is 103 across and 37 tall.

- Frame: the ring gear (teeth from 15.5 up to the top, 32) round a 5 mm back plate. Under
  the teeth the inside is 85 across, room for the carrier. A boss in the middle (8.0 across,
  1 tall) is the shoulder under the center stack; the center axle's lower end stands in a
  5.3 socket in it, and the center screw's head sits in a 9.5 pocket under the plate.
- Carrier: a 82 across plate (10 to 15) with a hub under it (1 to 15) holding two 625s,
  three windows between the planets, and a 5.3 socket for each planet axle (screw head
  under the plate).
- Sun and planets: 15T, 16 tall, two 625s each (seats 0..5 and 9..14), the axle flange in
  the top 2.
- Axles: a 5.0 shank with an 8.0 x 1.5 flange (inner race only). The center one (30.5
  shank) carries carrier and sun, the planet ones (17.5 shank) one planet each. A 3.6 pilot
  runs up from the lower end, stopping under the flange.
- Spacers: 8.0 x 5.5 rings. 4.0 between each part's two inner races, 1.0 under the sun and
  under each planet.

### Why axles, not screws, through the bearings

The screws on hand are #8 (4.17 mm). A 625's bore is 5.0, so a screw through it lets the
bearing sit up to 0.4 off center, enough for the gears to bind or skip; a printed sleeve
between them would be 0.4 thick. So a printed 5.0 axle carries each stack, and the #8 comes
up from underneath and cuts its own thread in the axle's pilot hole. The threaded length is
always inside a steel inner race, a spacer or a socket, so the thin wall round the thread
cannot split outward.

Tightened, the screw pulls the axle down. Center stack: flange, sun upper inner race,
spacer, sun lower inner race, 1.0 spacer, carrier upper inner race, spacer, carrier lower
inner race, frame boss. Planet stack: flange, inner race, spacer, inner race, 1.0 spacer,
carrier plate. The load stays on the inner races, never through the balls.

### Seats

16.2 across with a 0.4 lead-in (see gear-toys.md: 16.0 printed tight). The seat that prints
against the bed stops on a 45 deg cone meeting the outer race's corner (no unsupported
ceiling), the other on a flat 13.5 ledge. The 4.0 gap between the two seats is what the cone
needs.

## Screw lengths

| Screw | Fits | Notes |
| --- | --- | --- |
| Center (1) | 5/16 to 1 in | head in the pocket under the frame |
| Planet (3) | 3/8 to 5/8 in | head under the carrier; up to 3/4 with a 3 mm `Screw_Spacer` under the head |

## Print list

`cad/export/planetary_fidget/`, each file one closed solid; the count is in the name. All
print without supports, in the pose they are exported in.
- `Spinner_Frame`: plate down. `Spinner_Carrier`: top face down (the hub up).
- `Spinner_Gear_15T_x4`: the tapered tooth ends down.
- `Spinner_Axle_Center`, `Spinner_Axle_Planet_x3`: flange down.
- `Spinner_Spacer_4.0_x5`, `Spinner_Spacer_1.0_x4`, `Spinner_Screw_Spacer_x3`, and the tuning
  set `Spinner_Spacer_3.8` / `3.9` / `4.1` / `4.2`.

One plate in PLA, 0.20 mm: about 3.5 h and 100 g.

Hardware: ten 625 bearings, four #8 machine screws (one 5/16 to 1 in, three 3/8 to 5/8 in).

## Assembly

1. Press a bearing into each end of the sun, the planets and the carrier: the first one
   into the face that printed on the bed (it stops on the cone), then drop a 4.0 spacer in,
   then press the second one down onto its ledge.
2. Planets: a 1.0 spacer on the carrier over each socket, a planet on it, a planet axle down
   through it into the socket, a screw up from under the carrier. Snug it and spin the
   planet.
3. Carrier into the frame over the boss, turning it a little so the planets drop into the
   ring. A 1.0 spacer on the carrier's top inner race, then the sun, turned until it drops
   between the planets.
4. Center axle down through the sun and the carrier into the frame socket; the center screw
   up from under the plate.
5. Tuning: if a part spins free while loose but drags once its screw is tight, its 4.0
   spacer is wrong for that print; try 4.1 or 4.2 (or 3.9 / 3.8).

If an axle is too tight in its bearings, sand the shank lightly; if a screw is very hard to
start, run it into the pilot once before assembly.

## Checks (`check()`)

At three sun / carrier angles:
- Each planet turns 0.21 mm each way at the pitch circle against the sun and 0.15 against
  the ring before the teeth touch.
- Parts that turn against each other stay clear: 1.0 between the carrier and the frame, the
  sun and the planets; spacers 0.71 from the bores; each inner race at least 0.78 clear of
  the part turning round it, each outer race 0.5 clear of anything standing still; screws
  2.6 inside the bores, the planet screw heads 7.2 over the frame plate.
- Every export is one closed solid.

## Safety

Bearings, screws and spacers are small parts: not for children who still put things in their
mouths. Once assembled everything is trapped by the screws.
