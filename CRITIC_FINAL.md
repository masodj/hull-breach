# Visual critic — final review (round 5)

Reviewer: an isolated subagent that saw only renders (6 poses at 2560×1440, 12 native 1:1 crops, 5 bursts of 5 consecutive 60 fps frames at 1920×1080, 20 time-lapse frames across the 60 s fly-through). It never saw source code or reasoning.
Renders came from headless Chromium with a software WebGPU rasterizer (SwiftShader), not a hardware GPU.

**Score: 7.5 / 10 — VERDICT: MODERATE** (gate was "nothing above MINOR"; not met. Further rounds were stopped at the user's request.)

Score history: 5.5 (MAJOR) → 6.5 (MAJOR) → 7.0 (MAJOR) → 7.5 (MODERATE) → 7.5 (MODERATE).

## Overall

Cohesive, good-looking image: strong cyan/white/amber art direction, convincing glossy floor reflections, clean edges at 1:1, readable bloom, real zone variety. Nothing broken and no MAJOR defect. Held back by model primitiveness on the brute and cargo crates, a few shading/texture artefacts on near walls, and unshadowed-looking light blotches in corridors.

## Defects

| # | Severity | Defect | Where |
|---|---|---|---|
| D1 | MODERATE (upper) | Brute enemy reads as stacked rounded cubes with the same glow line on each face | pose3, timelapse t16/t49/t55 |
| D2 | MODERATE | Moiré banding on corrugated wall panels, pattern changes frame to frame | bursts t05, timelapse t04, pose1 |
| D3 | MODERATE | Blotchy light hot-spots on corridor ceilings; baffles cast no occlusion | bursts t05/t38, timelapse t07/t19/t34/t37 |
| D4 | MODERATE | Near walls: streaky speckle under muzzle-flash light; label decals blur when magnified | bursts t38, timelapse t07/t37 |
| D5 | MODERATE | Cargo crates are plain boxes; rust blotches read as noise | pose3, bursts t15, timelapse t49 |
| D6 | MODERATE (partly rail-camera) | Enemies and biomass wall intersect the weapon/camera at point-blank | bursts t27, pose3, timelapse t55/t58 |
| D7 | MODERATE (lower) | Planet soft at 1:1; hard terminator, thin limb glow | pose2 |
| D8 | MINOR | Hard-edged light wedge on a pillar | pose2 |
| D9 | MINOR | Faint weapon-shaped ghost on a wall during a fast pan | bursts t05 |
| D10 | MINOR | Oversized yellow streak near the camera | timelapse t31 |
| D11 | MINOR | Teal floor panels read as pasted matte rectangles | pose0, timelapse t22 |
| D12 | MINOR | Some window views flatter than others | bursts t27, timelapse t25 |
| D13 | MINOR | HUD: thin digit strokes, reserve-ammo baseline, panel slightly transparent | all |

Changed after this review and **not re-reviewed**: corrugation ribs now fade out earlier with distance (aimed at D2) and the wall scratch layer was removed (aimed at D4a).

## Works well

- Edge quality at 1:1 is clean; no jaggies on strips, pipes, legs or hazard stripes.
- Glossy floor reflections are convincing and stable across the slow bursts.
- Controlled bloom; no banding in dark gradients; balanced exposure in every time-lapse frame.
- Strong palette and zone identity (blue corridor, grey hangar, magenta window hall, red infested hall).
- Crawler and floater enemies, biomass walls and pods at mid distance.
- Both weapons: clean silhouettes, rounded forms, accent lights; muzzle flash, tracers and sparks.
- High wall-kit density: pipes, conduits, vents, screens, LEDs, chevrons, lockers.
- No flicker, popping or noise boiling in the slow bursts.
