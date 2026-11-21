# HULL BREACH

A first-person shooter set on a dark alien-infested spaceship. Kill every alien aboard.

The whole game is one self-contained `index.html` (about 100 KB minified). It is rendered with WebGPU, uses no engine or library, and loads no external files: geometry, materials, sky, sounds and music are all generated in code.

Version 1.3 · © 2026 masodj@centrum.cz

## Play

Open `index.html` in a browser with WebGPU (recent Chrome or Edge), pick a difficulty and click to board.

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| Left mouse button | Fire |
| `R` | Reload |
| `1` / `2` | Shotgun / minigun (once found) |
| `Q` or mouse wheel | Swap weapon (once the minigun is found) |
| `M` | Music on/off |
| `Esc` | Pause |

## The game

**Weapons**

- **Shotgun** — 8 shells, ten pellets per shot, slow but lethal up close. You board with it and 32 spare shells.
- **Minigun** — 150 rounds, spins up before firing, 18 rounds per second. You do not start with it: it lies somewhere aboard, in a room away from the start, as a turning model of the gun over a violet ring. Picking it up gives a full drum and 300 spare rounds.

**Aliens**

- **Crawler** — fast insect that attacks in packs and bites.
- **Spitter** — floating polyp that lobs plasma from a distance.
- **Brute** — slow armoured biped with a lot of health and a heavy melee hit.

Dead aliens stay where they fall. When only three are left alive, they stop waiting and hunt you down wherever you are.

**Difficulty**

| | Easy | Medium | Hard |
|---|---|---|---|
| Aliens | 24 | 34 | 53 |
| Alien health | normal | +50% | +75% |
| Alien damage | normal | +40% | +80% |
| Alien speed | normal | +15% | +35% |
| Alien attack rate | normal | +20% | +40% |
| Plasma bolt speed | 15 m/s | 20 m/s | 26 m/s, aimed ahead of a moving player |
| Health crate | 40 | 30 | 25 |

Ammo crates are the same on every difficulty. The choice is remembered between runs.

**Timer and best times**

- A run timer in the top-right corner counts play time (it stops while paused).
- Clearing the ship records your time in a local leaderboard: the ten best times per difficulty, with the name typed on the start screen and the date. It is stored in the browser only.
- The start screen shows the best times for the selected difficulty.

**The ship**

- The layout is different on every run: rooms, corridors, props, aliens and crates are generated from a random seed. Only the north observation deck is always there.
- Corridors, halls, a reactor room, infested nests and an observation deck with a planet and stars outside.
- Green crates restore health (see the table); orange crates give 12 shells and 150 minigun rounds (the rounds are kept for when you find the gun).
- Red barrels with a glowing band explode when shot. The blast hurts everything within 7 m, including you, and can set off other barrels.
- Shots leave marks on walls, floors and ceilings.

## How it is built

- **Renderer:** deferred WebGPU pipeline with a depth pre-pass, soft shadows from a wall distance field, ambient occlusion, screen-space reflections, light haze and sun shafts, temporal anti-aliasing and bloom.
- **Geometry:** a layout generator places rooms, links them with corridors and checks that every cell is reachable; the ship mesh is then built from that map at start-up. Aliens, weapons, crates and barrels are built from one instanced unit shape that the vertex shader morphs into boxes, spheres, cylinders and rounded boxes.
- **Audio:** a single audio worklet synthesises every sound effect, a room reverb and a 174 bpm drum and bass track in real time.
- **No garbage:** game state lives in preallocated typed arrays, so the game code allocates nothing per frame.

## Why it is so small

The file contains almost no data, only the code that generates everything when the game starts. A typical game is big because of its assets and engine, and this one ships neither.

- **No textures:** every surface (metal panels, grime, alien skin, the planet and stars) is computed by maths in the shaders at draw time.
- **No models:** the ship mesh is built at start-up from a 40×26 grid of cells, and aliens, guns, crates and barrels are all assembled from one unit cube that the vertex shader bends into boxes, spheres and cylinders.
- **No audio files:** gunshots, footsteps, the reverb and the whole drum and bass track are synthesised live by one audio worklet. The music is a few note patterns plus oscillator code.
- **No engine or libraries:** the game talks to WebGPU directly, so it only carries the features it actually uses.
- **No fonts or images for the HUD:** the digits are seven-segment shapes drawn in the final shader.
- **Minified:** the build shortens names and strips whitespace in both the JavaScript and the shaders.

The trade-off is that the cost moves from disk to the GPU and CPU: the detail is recomputed every frame rather than read from a file.

## Source and build

```
src/00_core.js     parameters, maths, map, distance fields, path finding
src/10_world.js    ship geometry and lights
src/20_shaders.js  WGSL shaders
src/30_game.js     game logic, audio, instance and sprite building
src/40_render.js   WebGPU setup, frame loop, input, benchmark
tools/build.js     concatenates and minifies src/ into index.html
```

The build needs Node.js and `terser`. Point `TOOLS` at a `node_modules` folder that contains it:

```
npm install terser
TOOLS=$PWD/node_modules node tools/build.js
```

## Benchmark and debug URLs

| URL | What it does |
|---|---|
| `index.html?bench` | 60 s scripted fly-through of the hand-made ship at 2560×1440 with GPU timestamp queries; click the result overlay to copy a JSON report |
| `index.html?bench&mul=3` | Same, rendering each frame three times to make the run GPU-bound |
| `index.html?fly` | The fly-through without measuring |
| `index.html?pose=N` | One of six fixed camera poses (0–5) |
| `index.html?d=N` | Start with difficulty 0, 1 or 2 |
| `index.html?seed=N` | Play a specific generated ship (the seed of each run is shown at the bottom of the start screen) |
| `index.html?classic` | Play the original hand-made ship |

The design target is a steady 180 Hz at 2560×1440 on an RTX 5070 Ti (GPU frame time 11 ms or less on average, no frame over 16.7 ms). An early build measured roughly 8–9 ms per frame on that hardware; the current version has not been re-measured.
