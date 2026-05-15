# Traffic Intersection Simulation

## What it does

A four-way intersection simulation built with vanilla JavaScript and the Canvas API. Cars spawn on inbound lanes, queue with lane-owned spacing, obey a declarative signal phase cycle (through, yellow, all-red, protected left with left yellow, then the cross axis), and follow bezier paths through the intersection. Green phases use **sensor-aware adaptive timing**: they hold at least `min` seconds, extend up to `max` while demand remains, and end early when queues are empty. Collision safety is structural—protected phases, all-red clearance, and zone-based intersection occupancy—not physics-based collision detection.

## Running it

```bash
npm install && npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Production build: `npm run build` then `npm run preview`.

**Reproducible runs:** append a numeric seed to the URL, e.g. `?seed=42`.

## Architecture

Three layers: `main.js` runs the requestAnimationFrame loop; `simulation.js` owns mutable state and exposes `update(delta)` and `reset()`; `renderer.js` reads state and draws without mutating it. Lane geometry and paths live in `geometry.js`. Movement and queue rebuild live in `carManager.js`. Zone clearance and per-lane entry FIFO live in `intersectionController.js`. The phase table, adaptive timing, and `canMove()` live in `trafficController.js`. The HTML overlay in `ui.js` only reads simulation state and drives transport controls.

Collision safety is structural: only one axis has main green at a time, all-red gaps separate conflicting movements, and `intersectionController` reserves zones so crossing paths do not overlap.

## Key design decisions

- **Lane-owned queues** — Each lane maintains `queue[]` (car ids). `carManager` rebuilds queues each tick for spacing; `readSensors()` sums queue depth per axis and movement type to drive adaptive greens.
- **`trafficController.canMove()` + `intersectionController.canProceed()`** — Signal permission and intersection zone clearance are separate; both must pass before a car enters a crossing path. Cars already turning may finish during left yellow.
- **Phase table as data** — `PHASES` in `trafficController.js` is fully declarative. Lights are derived from the active row; non-fixed phases extend or cut on sensor demand.
- **Three-canvas rendering** — `#bg` (static road, redrawn on resize or tweak), `#fg` (cars, optional debug overlays), `#signals` (signal heads). DPR-aware scaling keeps lines crisp on Retina displays.
- **HTML HUD, not canvas HUD** — Phase name, timer, telemetry, and transport controls live in the DOM (`ui.js` + `index.html`). The canvas `drawHUD()` hook remains unused.
- **Bezier turning with tangent heading** — Cars follow quadratic/cubic paths; heading comes from the path derivative. Brake lights and blinking turn signals are presentation-only.

## File map

| File | Role |
|------|------|
| `src/main.js` | Entry, rAF loop, delta clamping, tab-hide reset, wires UI and tweaks |
| `src/constants.js` | All numeric configuration — single source of truth |
| `src/geometry.js` | Lane layout, stop lines, crosswalks, bezier waypoints, path evaluation |
| `src/simulation.js` | Mutable state; `update(delta)` and `reset()` |
| `src/trafficController.js` | Phase state machine, adaptive timing, light derivation, `canMove()` |
| `src/intersectionController.js` | Zone occupancy, per-lane entry FIFO, crossing handoff |
| `src/carManager.js` | Spawn, lane queues, inbound/crossing/exiting movement, despawn, stats |
| `src/sensorSystem.js` | `readSensors(sim)` — axis demand from `lane.queue` lengths |
| `src/renderer.js` | DPR canvases, road, cars, signals, brake/turn lights, pan/zoom viewport |
| `src/ui.js` | HTML overlay: phase display, telemetry, play/pause/step/speed/reset |
| `src/tweaks.js` | Theme, traffic density, diagnostics overlay, crosswalk visibility |
| `src/utils.js` | Seeded RNG |

## Configuration

All tunables live in `src/constants.js`. Useful knobs:

| Constant | Effect |
|----------|--------|
| `SPAWN.INTERVAL` | Base spawn interval (overridden by **Density** tweak: low / med / high) |
| `SPAWN.MAX_CARS` / `SPAWN.MAX_PER_LANE` | Fleet caps |
| `SPAWN.RIGHT_LANE_ONLY` | When `true`, only spawns on right-turn lanes (dev shortcut) |
| `PHASE.MIN_GREEN_STRAIGHT` / `MAX_GREEN_STRAIGHT` | Adaptive green window for through phases |
| `PHASE.MIN_GREEN_LEFT` / `MAX_GREEN_LEFT` | Adaptive window for protected left |
| `PHASE.YELLOW_DURATION` / `ALL_RED_DURATION` | Clearance timings |
| `CAR.MAX_SPEED`, `CAR.FOLLOW_GAP`, `CAR.STOP_DECEL_ZONE` | Movement and queuing feel |
| `DEBUG_ADAPTIVE_TIMING`, `DEBUG_PHASE_TRANSITIONS`, `DEBUG_LANE_QUEUES` | Console logging flags |

**Runtime tweaks** (bottom-left panel): Day/Night theme, traffic density, diagnostics (intersection zones + reserved cars), crosswalk visibility.

**Keyboard shortcuts:** `Space` play/pause · `R` reset · `1`–`4` speed (0.5×, 1×, 2×, 4×). Pan and zoom the map via the viewport (drag / scroll).

## Time spent

Progress against the architecture build order ([`traffic-intersection-architecture-v3.md`](traffic-intersection-architecture-v3.md) §19):

| Step | Focus | Status |
|------|--------|--------|
| 1 | Setup — Vite, constants, DPR canvas | **Done** |
| 2 | Static world — geometry, road rendering, crosswalks | **Done** |
| 3 | Loop + cars — rAF, spawn, inbound movement | **Done** |
| 4 | Traffic control — phase table, signal heads, stop/go | **Done** |
| 5 | Queue system — lane `queue[]`, spacing, crossing boundary | **Done** |
| 6 | Left turns — bezier paths, protected left, left yellow | **Done** |
| 7 | Sensors + adaptive timing | **Done** — `readSensors` wired into `trafficController.update` |
| 8 | Polish + HUD — stats, brake lights, controls UI | **Done** — HTML HUD + transport; brake/turn signals on canvas |
| 9 | Stretch goals | **Partial** — diagnostics toggle, density tweak, crosswalk art; no right-on-red or pedestrian phase |

## What's missing

**Not in MVP (architecture §18 stretch):**

- Right-turn-on-red
- Pedestrian walk buttons and all-red pedestrian phase (crosswalks are visual only)
- Canvas HUD / phase progress bar on the map (`drawHUD` stub unused; DOM covers telemetry)
- Seed input in the UI (seed via `?seed=` URL only)
- Debug overlay for waypoints and per-car state labels (zone diagnostics exist via **Tweaks → Diagnostics**)
- Arrival-rate slider beyond the density preset, flashing orange / permissive left

**Explicitly out of scope:** priority vehicles, multiple intersections, replay/recording, network or persistence.
