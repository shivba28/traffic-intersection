# Traffic Intersection Simulation

## What it does

A four-way intersection simulation built with vanilla JavaScript and the Canvas API. Cars spawn on inbound lanes, queue behind one another, obey a declarative traffic-signal phase cycle (straight, yellow, all-red, protected left, then the cross axis), and follow bezier paths through the intersection before exiting. Collision safety is structural: protected phases, all-red clearance intervals, and zone-based intersection occupancy—not physics-based collision detection.

## Running it

```bash
npm install && npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Production build: `npm run build` then `npm run preview`.

## Architecture

The app follows three layers: `main.js` runs the requestAnimationFrame loop; `simulation.js` owns mutable state and exposes `update(delta)`; `renderer.js` reads that state and draws without mutating it. Lane geometry and paths live in pure data (`geometry.js`); movement and signal obedience live in `carManager.js` and `intersectionController.js`; the phase table and light derivation live in `trafficController.js`.

Collision safety is structural: only one axis has main green at a time, all-red gaps separate conflicting movements, and `intersectionController` reserves quadrant zones so crossing cars do not overlap.

## Key design decisions

- **Lane-owned geometry, platoon following on `sim.cars`** — Lanes define centerlines, stop positions, and bezier paths. Following distance uses `carAhead()` on the flat car list rather than mutating `lane.queue[]` (queues exist on lane objects for future sensor wiring but are not populated yet).
- **`trafficController.canMove()` + `intersectionController.canProceed()`** — Signal permission and intersection zone clearance are separate checks; both must pass before a car enters a crossing path.
- **Phase table as data** — `PHASES` in `trafficController.js` is fully declarative (per-axis main and left-arrow states). Lights are derived from the active row, not scattered conditionals.
- **Three-canvas rendering** — `#bg` (static road, redrawn on resize), `#fg` (cars and debug overlays), `#signals` (signal heads). DPR-aware scaling keeps lines crisp on Retina displays.
- **Bezier turning with tangent heading** — Cars follow quadratic/cubic paths through the intersection; heading comes from the path derivative, so turns look smooth without a physics engine.

## File map

| File | Role |
|------|------|
| `src/main.js` | Entry, rAF loop, delta clamping, tab-hide reset, pause/speed hooks (no UI yet) |
| `src/constants.js` | All numeric configuration — single source of truth |
| `src/geometry.js` | Lane layout, stop lines, bezier waypoints, path evaluation (pure data + helpers) |
| `src/simulation.js` | Mutable state; `update(delta)` and `reset()` |
| `src/trafficController.js` | Phase state machine, light derivation, `canMove()` API |
| `src/intersectionController.js` | Zone occupancy, per-lane entry FIFO, crossing path handoff |
| `src/carManager.js` | Spawn, inbound queueing, crossing/exiting movement, despawn, stats |
| `src/sensorSystem.js` | `readSensors()` — queue-length demand (not wired to the controller yet) |
| `src/renderer.js` | DPR-aware canvases, static road, cars, signals; HUD stub |
| `src/utils.js` | Seeded RNG |

## Configuration

All tunables live in `src/constants.js`. Useful knobs:

| Constant | Effect |
|----------|--------|
| `SPAWN.INTERVAL` | Seconds between spawn attempts |
| `SPAWN.MAX_CARS` / `SPAWN.MAX_PER_LANE` | Fleet caps |
| `SPAWN.RIGHT_LANE_ONLY` | When `true`, only spawns on right-turn lanes (dev shortcut) |
| `PHASE.MIN_GREEN_STRAIGHT` / `MAX_GREEN_STRAIGHT` | Green window for straight phases (adaptive extension not implemented yet) |
| `PHASE.MIN_GREEN_LEFT` / `MAX_GREEN_LEFT` | Protected left-turn green window |
| `PHASE.YELLOW_DURATION` / `ALL_RED_DURATION` | Clearance timings |
| `CAR.MAX_SPEED`, `CAR.FOLLOW_GAP`, `CAR.STOP_DECEL_ZONE` | Movement and queuing feel |

Toggle intersection debug overlays in `src/intersectionController.js`: set `DEBUG_INTERSECTION.showIntersectionZones` or `showReservedCars` to `true`.

## Time spent

Honest progress against the architecture build order ([`traffic-intersection-architecture-v3.md`](traffic-intersection-architecture-v3.md) §19):

| Step | Focus | Status |
|------|--------|--------|
| 1 | Setup — Vite, constants, DPR canvas | **Done** |
| 2 | Static world — geometry, road rendering | **Done** |
| 3 | Loop + cars — rAF, spawn, straight inbound movement | **Done** |
| 4 | Traffic control — phase table, signal heads, stop/go on lights | **Done** (fixed `phase.min` timing only) |
| 5 | Queue system — lane spacing, queue/crossing boundary | **Partial** — platoon spacing via `carAhead()`; `lane.queue[]` not used; `crossingCars` array unused |
| 6 | Left turns — bezier paths, protected left phase, arrow head | **Done** |
| 7 | Sensors + adaptive timing | **Not done** — `readSensors()` exists but is not connected to `trafficController` |
| 8 | Polish + HUD — stats overlay, brake lights, controls UI | **Not done** — throughput/wait tracked internally; `drawHUD()` is a stub; no HTML controls |
| 9 | Stretch goals | **Partial** — debug zone overlay behind flags; no right-on-red, pedestrians, or arrival slider |

## What's missing

**Remaining for MVP (architecture §18):**

- Sensor-aware phase extension — extend/cut green on `lane.queue` demand
- HUD — current phase, timer/progress bar, per-lane queue counts, throughput, average wait
- Controls UI — play/pause, speed multiplier, reset, seed input (loop hooks exist in `main.js` but are not wired to DOM)
- Lane-owned `queue[]` population so `sensorSystem` reflects real demand
- Brake lights when decelerating (small visual polish from the plan)

**Stretch goals (cut unless time remains):**

- Right-turn-on-red
- Pedestrian walk / all-red ped phase
- Debug overlay toggled from UI (`D` key): waypoints, car state labels
- Arrival-rate slider, flashing orange / permissive left

**Explicitly out of scope:** priority vehicles, multiple intersections, replay/recording, network or persistence.
