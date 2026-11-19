# HULL BREACH

A first-person shooter set on a dark alien-infested spaceship. Kill every alien aboard.

The whole game is one self-contained `index.html` (about 95 KB minified). It is rendered with WebGPU, uses no engine or library, and loads no external files: geometry, materials, sky, sounds and music are all generated in code.

Version 1.1 · © 2026 masodj@centrum.cz

## Play

Open `index.html` in a browser with WebGPU (recent Chrome or Edge), pick a difficulty and click to board.

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| Left mouse button | Fire |
| `R` | Reload |
| `1` / `2` | Shotgun / minigun |
| `Q` or mouse wheel | Swap weapon |
| `M` | Music on/off |
| `Esc` | Pause |

## The game

**Weapons**

- **Shotgun** — 8 shells, ten pellets per shot, slow but lethal up close.
- **Minigun** — 150 rounds, spins up before firing, 18 rounds per second.

**Aliens**

- **Crawler** — fast insect that attacks in packs and bites.
- **Spitter** — floating polyp that lobs plasma from a distance.
- **Brute** — slow armoured biped with a lot of health and a heavy melee hit.

Dead aliens stay where they fall.

**Difficulty**

| | Aliens | Alien health |
|---|---|---|
| Easy | 24 | normal |
| Medium | 34 | +50% |
| Hard | 43 | +75% |

Ammo and health crates are the same on every difficulty. The choice is remembered between runs.

**The ship**

- Corridors, halls, a reactor room, an infested hive and observation decks with a planet and stars outside.
- Green crates restore 40 health; orange crates give 12 shells and 150 minigun rounds.
- Red barrels with a glowing band explode when shot. The blast hurts everything within 7 m, including you, and can set off other barrels.
- Shots leave marks on walls, floors and ceilings.

## How it is built

- **Renderer:** deferred WebGPU pipeline with a depth pre-pass, soft shadows from a wall distance field, ambient occlusion, screen-space reflections, light haze and sun shafts, temporal anti-aliasing and bloom.
- **Geometry:** the ship is generated from an ASCII map at start-up. Aliens, weapons, crates and barrels are built from one instanced unit shape that the vertex shader morphs into boxes, spheres, cylinders and rounded boxes.
- **Audio:** a single audio worklet synthesises every sound effect, a room reverb and a 174 bpm drum and bass track in real time.
- **No garbage:** game state lives in preallocated typed arrays, so the game code allocates nothing per frame.

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
| `index.html?bench` | 60 s scripted fly-through at 2560×1440 with GPU timestamp queries; click the result overlay to copy a JSON report |
| `index.html?bench&mul=3` | Same, rendering each frame three times to make the run GPU-bound |
| `index.html?fly` | The fly-through without measuring |
| `index.html?pose=N` | One of six fixed camera poses (0–5) |
| `index.html?d=N` | Start with difficulty 0, 1 or 2 |

The design target is a steady 180 Hz at 2560×1440 on an RTX 5070 Ti (GPU frame time 11 ms or less on average, no frame over 16.7 ms). An early build measured roughly 8–9 ms per frame on that hardware; the current version has not been re-measured.
