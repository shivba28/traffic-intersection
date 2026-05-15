# Traffic Intersection Simulation

A four-way traffic intersection built with vanilla JavaScript and the Canvas API. Signal phases run a declarative state machine with sensor-aware adaptive timing, protected left-turn phases, and a pedestrian walk cycle. Cars spawn, queue, follow Bézier turning paths, and obey signal state — all rendered live on a multi-layer canvas at 60 fps.

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build   # production bundle
npm run preview # serve the build locally
```

---

## What's implemented

| Feature | Status |
|---------|--------|
| Signal cycle — green, yellow, all-red | ✅ |
| Protected left-turn phase (NS left, EW left, each with left-yellow) | ✅ |
| Adaptive green timing (extends when queues are present, cuts early when empty) | ✅ |
| Car spawning, lane queuing, inbound movement, stop-line braking | ✅ |
| Bézier turning paths (left, right, through) with tangent heading | ✅ |
| Intersection zone occupancy (structural collision prevention) | ✅ |
| Pedestrian walk/flash-don't-walk cycle triggered by crosswalk buttons | ✅ |
| Draggable crosswalk control panel with per-approach push buttons | ✅ |
| Multi-layer canvas (background road, moving cars, signal heads) | ✅ |
| Viewport pan and zoom with compass | ✅ |
| Day/Night theme, density presets, diagnostics overlay | ✅ |
| Transport controls: play/pause, step, 0.5×/1×/2×/4× speed, reset | ✅ |
| Seeded RNG for reproducible runs | ✅ |
| Right-turn-on-red | ❌ (out of scope) |
| Permissive/flashing-yellow left | ❌ (out of scope) |
| Priority vehicles | ❌ (out of scope) |

**Keyboard shortcuts:** `Space` play/pause · `R` reset · `1`–`4` speed multiplier. Drag and scroll to pan/zoom the viewport.

---

## Design decisions

### Why vanilla JS + Canvas, no framework

The simulation is a tight update loop: read sensor state → advance signal phase → move cars → draw. A framework (React, Vue) would add reconciliation overhead between a DOM tree and mutable simulation state with no payoff — the "UI" here is a `<canvas>`, not a component tree. Vite provides ES module bundling and HMR during development with zero config. That's all the tooling this project needs.

### Three-layer canvas

Three `<canvas>` elements stack on the same pixel footprint:

- `#bg` — static road, lane markings, crosswalks. Redrawn only on resize or theme change.
- `#fg` — cars, brake lights, turn signals, debug overlays. Redrawn every frame.
- `#signals` — signal heads. Redrawn every frame (phase changes are infrequent but need pixel-crisp rendering).

Splitting the layers means road geometry isn't repainted 60 times per second. On a Retina display the background canvas saves a meaningful amount of work per frame.

The HTML overlay (`ui.js` + `index.html`) handles the HUD — phase name, timer, telemetry, transport controls. DOM text is cheaper to update than canvas text and far easier to style.

### Signal phase state machine

The signal cycle lives in a fully **declarative phase table** (`PHASES` in `trafficController.js`). Each row is a plain object spelling out the exact signal state for every approach:

```js
{
  id: 'NS_STRAIGHT',
  min: 9, max: 10, fixed: false,
  ns: { main: 'GREEN', leftArrow: 'OFF' },
  ew: { main: 'RED',   leftArrow: 'OFF' },
}
```

The state machine advances an index through that array. Light derivation is a pure function of the current row — no conditional logic that maps phase names to colors. The table is validated once at module load and asserts at runtime that NS and EW are never simultaneously green, catching misconfiguration before it produces a silent bug. Adding a new phase (e.g. an all-red pedestrian gap) means inserting one row.

The 12-phase cycle:
```
NS_STRAIGHT → NS_YELLOW → ALL_RED →
NS_LEFT → NS_LEFT_YELLOW → ALL_RED →
EW_STRAIGHT → EW_YELLOW → ALL_RED →
EW_LEFT → EW_LEFT_YELLOW → ALL_RED → (repeat)
```

**Adaptive timing:** non-fixed phases hold at `min` seconds and extend up to `max` while `readSensors()` reports demand on the active axis. If queues drain before `min`, the phase still runs its minimum; if demand persists at `max`, it yields regardless. Large delta values (tab hiding, debugger pauses) are sub-stepped at 100 ms to prevent phase skipping.

**Pedestrian phase:** a latched push-button request triggers a WALK → FLASHING_DON'T_WALK → END cycle during an all-red clearance gap, when `isFullVehicleStop()` is true. Vehicles cannot receive a green signal while `pedState !== IDLE`. Walk and flash durations are sampled from the seeded RNG each cycle so they feel variable but are reproducible.

### Collision safety is structural, not physics-based

There is no physical collision detection. Safety is guaranteed by construction:

1. **One axis has green at a time** — enforced by the phase table invariant.
2. **All-red gaps** separate every conflicting phase transition.
3. **Intersection zone occupancy** (`intersectionController.js`) tracks four quadrant zones. A car reserves all zones along its path before proceeding, releasing them on exit. Opposing left-turns use per-approach virtual slots (`LT_N`, `LT_E`, etc.) rather than shared quadrant IDs, so geometrically independent opposite-direction lefts are not unnecessarily serialized.

`trafficController.canMove()` checks signal permission; `intersectionController.canProceed()` checks zone clearance. Both must pass. Cars mid-turn during LEFT_YELLOW are allowed to finish — stopping in the box would be worse than completing the turn.

### Lane-owned queues

Lanes own `queue[]` (ordered car IDs). `carManager` rebuilds queues from scratch each tick based on car positions — no mutation logic scattered across car update paths. `readSensors()` sums queue depth per axis and movement type to produce the demand numbers the adaptive phase timer consults. Queue depth is the right proxy for demand: it reflects cars that are actually stopped and waiting, not merely nearby.

### Single constants file

Every magic number lives in `src/constants.js`. Phase durations, car dimensions, speed limits, spawn intervals — one file, one place to tune feel. Tweaking the yellow duration doesn't require a code search.

---

## File map

| File | Role |
|------|------|
| `src/main.js` | Entry point — rAF loop, delta clamping, tab-visibility reset |
| `src/constants.js` | All numeric configuration |
| `src/geometry.js` | Lane layout, stop lines, crosswalks, Bézier waypoints |
| `src/simulation.js` | Mutable state; `update(delta)` and `reset()` |
| `src/trafficController.js` | Phase state machine, adaptive timing, `canMove()` |
| `src/intersectionController.js` | Zone occupancy, per-lane entry FIFO |
| `src/carManager.js` | Spawn, queue, inbound/crossing/exiting movement, despawn |
| `src/sensorSystem.js` | `readSensors(sim)` — axis demand from lane queue lengths |
| `src/renderer.js` | DPR canvases, road, cars, signals, pan/zoom viewport |
| `src/ui.js` | HTML overlay — phase display, telemetry, transport controls |
| `src/tweaks.js` | Theme, density, diagnostics toggle |
| `src/draggablePanel.js` | Draggable crosswalk control panel |
| `src/utils.js` | Seeded RNG |

---

## Configuration

All tunables are in `src/constants.js`.

| Constant | Effect |
|----------|--------|
| `SPAWN.INTERVAL` | Base spawn interval (overridden by Density tweak) |
| `SPAWN.MAX_CARS` / `SPAWN.MAX_PER_LANE` | Fleet caps |
| `PHASE.MIN_GREEN_STRAIGHT` / `MAX_GREEN_STRAIGHT` | Adaptive green window for through movement |
| `PHASE.MIN_GREEN_LEFT` / `MAX_GREEN_LEFT` | Adaptive window for protected left |
| `PHASE.YELLOW_DURATION` / `ALL_RED_DURATION` | Clearance timings |
| `CAR.MAX_SPEED`, `CAR.FOLLOW_GAP`, `CAR.STOP_DECEL_ZONE` | Movement and queuing feel |
| `DEBUG_ADAPTIVE_TIMING`, `DEBUG_PHASE_TRANSITIONS` | Console logging flags |

**Runtime tweaks panel** (bottom-left): Day/Night theme · Traffic density · Diagnostics overlay (zone rects + reserved cars) · Crosswalk visibility.

---

## LLM-assisted development

This project was built using Claude and Cursor throughout — architecture planning, design decisions, were made using Claude and implementation using Cursor. The session transcripts are included in [`transcripts/`](./transcripts/).

### How AI moved the work forward

**Architecture before code.** Before any source file existed, I used Claude to draft the architecture spec (`traffic-intersection-architecture-v3.md`) — working through the phase table design, coordinate system conventions, and lane-queue ownership model as written documents first. The result was eight focused files with clear responsibilities from day one, not a refactor midway through.

**Declarative phase table over a switch statement.** The original instinct was a `switch` over phase name strings mapping to light colors. Claude pushed back and proposed a data-driven table where each row explicitly declares signal values per axis. That change made the runtime validator trivial to write, made the state machine's invariants enforceable, and made adding the pedestrian phase a single row insert rather than a spread of conditional branches.

**Geometry off-by-half bug.** Cars were floating half a car length behind the stop line. I described the symptom; Claude and Cursor identified the pattern — `stopLineY` was being used as the car center rather than the bumper position. We established the rule as an explicit note in `geometry.js` so the same confusion couldn't resurface later.

**Left-turn serialization.** Opposite-direction left turns (E→S and W→N) were blocking each other even though their paths don't overlap. Cursor identified that both were competing for the same quadrant zone IDs. The fix was per-approach virtual slots (`LT_N`, `LT_S`, etc.) for left-turns — a model that correctly expresses which movements actually conflict rather than approximating it with geometry.

**Pedestrian phase integration.** Adding the pedestrian walk cycle needed to interlock with the vehicle phase timer without adding a second timer or breaking the state machine. The approach: run the pedestrian cycle only during all-red gaps where `isFullVehicleStop()` is true, holding the vehicle timer while `pedState !== IDLE`. That kept the update loop intact and added the feature without touching the phase table.

The AI sessions were most valuable for design decisions — where to draw module boundaries, which data structure to use, how to express a constraint — rather than generating boilerplate. Every output was read, understood, and revised before committing.

---

## Future scope

### Right-turn-on-red
Cars in a right-turn lane should be allowed to creep forward and turn right during a red phase if the conflicting through movement is clear. This requires a secondary permission check in `intersectionController` that bypasses `trafficController.canMove()` for the specific `right` movement type, plus a gap-acceptance model so the car waits for a safe break in crossing traffic rather than entering immediately. The zone occupancy system is already in place — right-on-red is primarily a policy change in `canMove()` and a new car behavior state.

### Permissive/flashing-yellow left
Currently all left turns are protected (dedicated green arrow, opposing traffic held at red). A permissive left allows a car to turn left during the opposing through-green by yielding to oncoming traffic. Implementing this would add a `PERMISSIVE_LEFT` signal state and a gap-acceptance loop in `carManager` that checks the opposing lane's queue and the positions of oncoming crossing cars before committing. The tradeoff is significantly more complex car decision logic in exchange for higher intersection throughput on low-traffic cycles.

### Priority vehicles (emergency preemption)
When an emergency vehicle approaches, the intersection should clear all movements, hold all signals red, and then give a green to the approach the vehicle is on. This needs a priority event API in `simulation.js` that interrupts the normal phase cycle, forces an all-red hold, and resumes the phase table from a known safe state once the vehicle clears. The phase state machine's declarative structure makes the preemption state straightforward to insert — it's a matter of adding a priority flag that pauses `_tickPhaseTimer` and holds lights at `ALL_RED` until cleared.

### Multiple intersections
Extending the simulation to a road network — multiple intersections connected by shared lanes — is the most architecturally significant addition. Each intersection would run its own `TrafficController` and `IntersectionController` instance, but cars would need to transfer between them as they exit one intersection's geometry and enter another's inbound lanes. The key design questions are: how to model the shared road segment between intersections (a queue with travel time, or continuous position tracking), and whether controllers coordinate (e.g. green wave timing along a corridor) or run independently. A green wave implementation would require a network-level coordinator that offsets phase cycles by the expected travel time between intersections, maximizing the chance that a car arriving from upstream finds a green. The current geometry and rendering systems are viewport-relative and would need to shift to world coordinates to support a multi-intersection map.