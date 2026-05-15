# Traffic Intersection Simulation — Architecture Plan v3

> **Revision goal:** Lean, polished, reviewable. No ceremony. No game-engine vocabulary.  
> **Stack:** Vanilla JS (ES Modules) · HTML/CSS · Canvas API  
> **Target:** 2–6 hour take-home challenge  

---

## Guiding Principle

> "What is the minimum architecture required to produce a polished, impressive, maintainable simulation in 2–6 hours?"

The answer: three clear layers (loop → simulation → renderer), lane-owned queues, an explicit phase table, and a single constants file. Everything else is added only when it creates visible value.

---

## 1. Folder / File Structure

```
traffic-intersection/
├── index.html
├── style.css
├── README.md
│
├── src/
│   ├── main.js               # Entry: wires everything, starts loop
│   ├── constants.js          # All config values — one source of truth
│   ├── geometry.js           # Lane positions, waypoints, sensor zones (pure data)
│   │
│   ├── simulation.js         # Owns mutable state; update(delta) is the public API
│   ├── trafficController.js  # Phase state machine + light state
│   ├── carManager.js         # Spawn, queue, move, despawn
│   ├── sensorSystem.js       # Queue-based demand detection
│   │
│   ├── renderer.js           # Reads state, draws everything; split later if needed
│   └── utils.js              # Seeded RNG and any other small pure helpers
│
└── .eslintrc.json
```

**Eight source files.** That's it for MVP.

### Why this structure

- A reviewer can open the repo and immediately understand the seam: `simulation.js` owns state, `renderer.js` reads it.
- No sub-folder nesting required at this scale. Folders add navigation overhead without benefit when there are eight files.
- `renderer.js` starts as one file. If it grows past ~300 lines, extract `drawIntersection()`, `drawCars()`, `drawHUD()` into focused helper functions in the same file, or split into two files. Do not pre-split.
- `geometry.js` is pure computed data — no update logic, no classes. Just exported objects.

---

## 2. Coordinate System Conventions

Define these once in `geometry.js` and never deviate.

```
Origin:  canvas top-left (0, 0)
+X:      right
+Y:      down  (standard canvas convention)
Center:  (WORLD_SIZE/2, WORLD_SIZE/2)  →  (400, 400)

Heading: degrees, clockwise from north (up)
  0°   = moving up    (southbound car approaching from south)
  90°  = moving right
  180° = moving down  (northbound car approaching from north)
  270° = moving left

Approaches:
  'N'  →  car enters from top,    moves DOWN  (heading 180°)
  'S'  →  car enters from bottom, moves UP    (heading 0°)
  'E'  →  car enters from right,  moves LEFT  (heading 270°)
  'W'  →  car enters from left,   moves RIGHT (heading 90°)
```

Document this block as a comment at the top of `geometry.js`. Geometry confusion is the single largest source of debugging time in canvas simulations. Resolve it before writing a single coordinate.

### Geometry Coordinate Ownership

Two rules that prevent half-length offset bugs:

- **`lane.centerX` / `lane.centerY`** represents the centerline of the lane. Cars are drawn centered on this coordinate.
- **`lane.stopLineY` / `lane.stopLineX`** represents the **front** of a car at rest — the bumper position, not the car's center. When placing a queued car, its center sits at `stopLineY - CAR.LENGTH / 2` (for N/S approaches), not at `stopLineY` itself.

Apply this offset consistently in `getTargetStopPosition()` and in bezier `p0` placement. Missing it by half a car length is a common source of cars appearing to overlap the stop line or float behind it.

---

## 3. Lane Queue Ownership

**Lanes own their queues. Cars do not manage their own position in line.**

### Lane Data Shape

```js
// geometry.js — each approach has 4 lanes
{
  approach: 'N',
  lanes: [
    { id: 'N_left',       type: 'left',     centerX: 358, stopLineY: 344, queue: [] },
    { id: 'N_straight_1', type: 'straight', centerX: 372, stopLineY: 344, queue: [] },
    { id: 'N_straight_2', type: 'straight', centerX: 386, stopLineY: 344, queue: [] },
    { id: 'N_right',      type: 'right',    centerX: 400, stopLineY: 344, queue: [] },
  ]
}
```

`queue` is an ordered `Car[]` — index 0 is the front car (nearest to stop line).

### Why this matters

With lane-owned queues:
- **Leader/follower is trivial:** `queue[i-1]` is always the car in front of `queue[i]`.
- **Stop position is deterministic:** `queue[i].targetY = queue[i-1].rear - CAR.FOLLOW_GAP`, no search.
- **Sensor logic is one line:** `lane.queue.length > 0`.
- **Spawn logic is clean:** append to `lane.queue`, assign position behind last car.
- **Despawn is clean:** `shift()` the front car when it clears the intersection.

### Car Position in Queue

```js
// carManager.js
function getTargetStopPosition(lane, queueIndex) {
  if (queueIndex === 0) {
    // Front car: center sits one half-length behind the stop line
    return lane.stopLineY - CAR.LENGTH / 2;
  }
  const leader = lane.queue[queueIndex - 1];
  return leader.y - CAR.LENGTH - CAR.FOLLOW_GAP;  // front of this car = rear of leader - gap
}
```

This replaces any general-purpose collision or following-distance system. It is simpler, more predictable, and produces correct queuing behavior.

### Queue Ownership Boundary During Crossing

Once a car transitions to `crossing`, it is **removed from the lane queue** and transferred to a separate `sim.crossingCars` array. This is a hard boundary.

```js
// carManager.js — on green light departure
lane.queue.shift();                  // remove from lane
sim.crossingCars.push(car);          // hand off to crossing list
car.state = 'crossing';
car.t = 0;
// Remaining queue cars recalculate their target positions next tick
```

The queue spacing recalculation loop must **only iterate `lane.queue`**, never `sim.crossingCars`. A crossing car's position is owned entirely by its bezier `t` parameter. Queue logic must never write to `car.x` or `car.y` while `car.state` is `'crossing'` or `'exiting'`. Violating this produces the classic snapping/jitter bug where a car teleports back to a queue slot mid-turn.

When a crossing car completes its bezier (`t >= 1`), it transitions to `exiting` and moves at constant speed toward the world boundary. It is never re-added to any queue.

---

## 4. Car Lifecycle

### State Transition Table

| From | To | Condition |
|---|---|---|
| *(spawn)* | `approaching` | Car created; placed behind queue tail |
| `approaching` | `waiting` | Car reaches its deterministic queue slot position |
| `waiting` | `crossing` | `car.queueIndex === 0` AND `canEnterIntersection(car, lights)` returns true |
| `crossing` | `exiting` | Bezier `t >= 1` (path fully traversed) |
| `exiting` | *(despawn)* | Car position outside world bounds OR `EXIT_TIMEOUT` exceeded |

No other transitions exist. Any state not in this table is a bug.

### `canEnterIntersection(car, lights)`

This is the single place signal permission logic lives. Do not scatter it across movement code.

```js
// carManager.js
function canEnterIntersection(car, lights) {
  if (car.queueIndex !== 0) return false;           // not at front of queue

  const signal = lights[car.approach];

  if (car.intent === 'left') {
    return signal.leftArrow === 'green';            // protected left requires green arrow
  }

  // straight and right require main green
  return signal.main === 'green';
}
```

Centralizing this here means:
- Phase logic never needs to know about car intents.
- Car movement logic never needs to decode phase IDs.
- Right-on-red, if added later, is one additional condition in this one function.

### Movement Per State

- **`approaching`:** Move along approach heading at `CAR.MAX_SPEED`, lerp speed toward target.
- **`waiting`:** `targetSpeed = 0`. Position is the deterministic queue slot (recalculated each frame from queue index).
- **`crossing`:** Advance bezier `t` by `delta * CROSSING_SPEED_T`. Position and heading derived from bezier. Queue logic does not touch this car.
- **`exiting`:** Move along exit heading at `CAR.MAX_SPEED`. No queue involvement.

---

## 5. Traffic Phase Design

### Recommended Phase Sequence

```
NS_STRAIGHT → NS_YELLOW → ALL_RED_1 → NS_LEFT → ALL_RED_2 →
EW_STRAIGHT → EW_YELLOW → ALL_RED_3 → EW_LEFT → ALL_RED_4 →
(repeat)
```

### Why ALL_RED between phases?

For a take-home challenge, ALL_RED clearance intervals are the right tradeoff:
- **Simpler logic:** No car can enter on a yellow of one phase and collide with cars starting on the next. The ALL_RED gap makes it physically impossible.
- **Easier to debug:** Visual confirmation that the intersection clears before movement resumes.
- **Realistic:** Real intersections use intergreen clearance periods. This is correct, not a simplification.
- **No left-turn yellow phase needed:** Left phases end with ALL_RED, not a separate LEFT_YELLOW. One fewer phase state, same safety guarantee.

### Phase Table

Each ALL_RED phase has a unique `id` so phase transitions log clearly and are easy to distinguish in a debug overlay.

```js
// trafficController.js
const PHASES = [
  { id: 'NS_STRAIGHT',       min: 15, max: 40, fixed: false, green: ['N','S'], leftGreen: [] },
  { id: 'NS_YELLOW',         min: 3,  max: 3,  fixed: true,  green: [],        leftGreen: [] },
  { id: 'ALL_RED_NS_TO_LEFT',min: 2,  max: 2,  fixed: true,  green: [],        leftGreen: [] },
  { id: 'NS_LEFT',           min: 8,  max: 20, fixed: false, green: [],        leftGreen: ['N','S'] },
  { id: 'ALL_RED_NS_TO_EW',  min: 2,  max: 2,  fixed: true,  green: [],        leftGreen: [] },
  { id: 'EW_STRAIGHT',       min: 15, max: 40, fixed: false, green: ['E','W'], leftGreen: [] },
  { id: 'EW_YELLOW',         min: 3,  max: 3,  fixed: true,  green: [],        leftGreen: [] },
  { id: 'ALL_RED_EW_TO_LEFT',min: 2,  max: 2,  fixed: true,  green: [],        leftGreen: [] },
  { id: 'EW_LEFT',           min: 8,  max: 20, fixed: false, green: [],        leftGreen: ['E','W'] },
  { id: 'ALL_RED_EW_TO_NS',  min: 2,  max: 2,  fixed: true,  green: [],        leftGreen: [] },
];
```

`fixed: true` = always run for exactly `min` seconds, no sensor extension. `fixed: false` = adaptive, runs between `min` and `max` based on demand.

### Light State Derivation

```js
// trafficController.js
_computeLights() {
  const phase = PHASES[this.phaseIndex];
  for (const approach of ['N','S','E','W']) {
    this.lights[approach] = {
      main:      phase.green.includes(approach)     ? 'green'
               : phase.id.includes('YELLOW')        ? 'yellow'
               : 'red',
      leftArrow: phase.leftGreen.includes(approach) ? 'green' : 'off',
    };
  }
}
```

Light state is always derived from the phase table. No separate tracking variables.

---

## 6. Collision Philosophy

Collision safety in this simulation is **structural**, not physics-based.

Three mechanisms make collisions impossible by construction:

- **Lane-owned queues** ensure cars in the same lane maintain deterministic spacing. Two cars in the same lane cannot overlap.
- **Protected phases and ALL_RED intervals** ensure conflicting movements are never simultaneously permitted. Two cars from conflicting approaches cannot be `crossing` at the same time.
- **Deterministic bezier paths** per `(approach, intent)` pair are designed to not intersect during the same phase.

General collision detection and response is intentionally out of scope for MVP. Do not add it. If two cars appear to overlap during development, the bug is in phase logic or queue boundary handling, not missing collision physics.

---

## 7. Turning Visuals — Bezier Approach

Pre-compute one quadratic bezier per `(approach, intent)` combination at startup in `geometry.js`.

### Bezier Definition

```js
// geometry.js
// Quadratic bezier: start (p0), control (p1), end (p2)
// p0 = front of car at stop line (stopLine position, not center)
waypoints['N_left'] = {
  p0: { x: 358, y: 330 },   // front of car at N_left stop line
  p1: { x: 358, y: 400 },   // control point (pulls curve through intersection center)
  p2: { x: 330, y: 414 },   // entry point of westbound exit lane
};
```

Straight-through paths use a degenerate bezier where `p1` is the midpoint of `p0 → p2`. This means the same traversal code handles all three intents with no branching.

### Traversal

```js
// carManager.js — update crossing car
car.t += delta * CAR.CROSSING_SPEED_T;
car.t = Math.min(car.t, 1);

const { p0, p1, p2 } = geometry.waypoints[`${car.approach}_${car.intent}`];
const t = car.t;

car.x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
car.y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;

// Heading from bezier tangent — smooth rotation, no separate lerp needed
const dx = 2*(1-t)*(p1.x-p0.x) + 2*t*(p2.x-p1.x);
const dy = 2*(1-t)*(p1.y-p0.y) + 2*t*(p2.y-p1.y);
car.heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

if (car.t >= 1) car.state = 'exiting';
```

The derivative-based heading gives smooth, natural-looking rotation through turns without any physics or spline libraries.

---

## 8. Despawn Rules

```js
// geometry.js — derived from WORLD constants
export const DESPAWN_BOUNDS = {
  minX: -WORLD.DESPAWN_MARGIN,
  maxX:  WORLD.SIZE + WORLD.DESPAWN_MARGIN,
  minY: -WORLD.DESPAWN_MARGIN,
  maxY:  WORLD.SIZE + WORLD.DESPAWN_MARGIN,
};
```

### Despawn Conditions

A car in `exiting` state is removed when ANY of:
1. `car.x < DESPAWN_BOUNDS.minX` or `car.x > DESPAWN_BOUNDS.maxX`
2. `car.y < DESPAWN_BOUNDS.minY` or `car.y > DESPAWN_BOUNDS.maxY`
3. `car.exitTimer > CAR.EXIT_TIMEOUT` — safety net for cars that get stuck

On despawn, in order:
1. Remove from `sim.crossingCars` (or `sim.exitingCars` if tracked separately)
2. `stats.throughput++`
3. `stats.totalWaitTime += car.waitTime` (for rolling average)

Cars in `waiting` state accumulate `waitTime += delta` each frame.

---

## 9. Simulation State Philosophy

**Simple and honest:**

- `simulation.js` owns all mutable state.
- `renderer.js` receives the simulation object and reads from it directly — no copy, no snapshot.
- `renderer.js` never writes to any simulation property.
- This is a read-only reference convention, enforced by discipline. That is appropriate for a challenge of this scope.

```js
// main.js
const sim      = new Simulation();
const renderer = new Renderer(fgCanvas, bgCanvas);

function tick(now) {
  const delta = computeDelta(now);
  sim.update(delta);
  renderer.draw(sim);   // reads sim.cars, sim.lights, sim.stats — writes nothing
  requestAnimationFrame(tick);
}
```

The simulation's public surface is: `update(delta)`, `reset()`, and direct property reads (`sim.cars`, `sim.lights`, `sim.stats`). Nothing else needs to be exposed.

### Reset Semantics

`sim.reset()` restores the simulation to its exact initial state:

- Clears `sim.cars`, `sim.crossingCars`
- Empties all `lane.queue` arrays
- Resets `trafficController` to phase index 0 with `phaseTimer = 0`
- Resets `stats` to zero
- Resets `spawnTimer` to 0
- Re-initializes the seeded RNG with the original seed

After `reset()`, running the simulation produces identical behavior to the first run with the same seed. This makes bug reproduction and visual demonstrations reliable.

---

## 10. Simulation Loop

```js
// main.js  (the loop is simple enough to live here, not its own file)
const MAX_DELTA = 1/30;
let lastTime    = null;
let paused      = false;
export let speedMultiplier = 1;

function tick(now) {
  if (!paused) {
    if (lastTime === null) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, MAX_DELTA) * speedMultiplier;
    lastTime = now;

    sim.update(delta);
    renderer.draw(sim);
  }
  requestAnimationFrame(tick);
}

// Reset lastTime on tab return — prevents burst delta on resume
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastTime = null;
});
```

The loop stays in `main.js`. It is ~20 lines and does not need its own file.

---

## 11. DPR-Aware Canvas Setup

Correct setup for crisp rendering on Retina and high-DPI displays. Do this once in `renderer.js` at initialization.

```js
// renderer.js
function initCanvas(canvas, logicalSize) {
  const dpr = window.devicePixelRatio || 1;

  // Backing resolution: physical pixels
  canvas.width  = logicalSize * dpr;
  canvas.height = logicalSize * dpr;

  // CSS size: logical pixels (how large it appears on screen)
  canvas.style.width  = `${logicalSize}px`;
  canvas.style.height = `${logicalSize}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);   // all subsequent drawing uses logical coordinates
  return ctx;
}

// Usage
this.bgCtx = initCanvas(bgCanvas, WORLD.SIZE);
this.fgCtx = initCanvas(fgCanvas, WORLD.SIZE);
```

After this, all drawing code uses logical coordinates (0–800). The DPR scaling is invisible to the rest of the codebase. Skipping this produces blurry canvas output on any modern display with `devicePixelRatio > 1`.

---

## 12. Sensor System

With lane-owned queues, sensors reduce to one function:

```js
// sensorSystem.js
export function readSensors(lanes) {
  const readings = {};
  for (const lane of lanes) {
    readings[lane.id] = lane.queue.length;
  }
  return readings;
}
```

`trafficController.js` calls this to decide whether to extend the current phase:

```js
// trafficController.js
const demand = sensorReadings[`${approach}_straight_1`]
             + sensorReadings[`${approach}_straight_2`]
             + sensorReadings[`${approach}_left`];
const shouldExtend = demand > 0 && this.phaseTimer < phase.max;
```

`sensorSystem.js` may feel trivial at this scale. That's intentional — its value is the named boundary between detection and control logic, not complexity.

---

## 13. Deterministic Spawn Strategy

```js
// constants.js
export const SPAWN = {
  INTERVAL:     2.5,   // sim-seconds between spawn attempts
  MAX_CARS:     20,    // hard cap on active cars (queued + crossing + exiting)
  MAX_PER_LANE:  4,    // don't stack more than 4 cars in one lane
};
```

```js
// carManager.js
update(delta) {
  this.spawnTimer += delta;

  if (this.spawnTimer >= SPAWN.INTERVAL && this.activeCars.length < SPAWN.MAX_CARS) {
    this.spawnTimer = 0;
    const lane = this._pickSpawnLane();       // round-robin approach, random lane
    if (lane && lane.queue.length < SPAWN.MAX_PER_LANE) {
      this._spawnCar(lane);
    }
  }
}
```

Round-robin across approaches distributes traffic evenly. Lane selection within approach uses the seeded RNG. Timer resets on pause/resume via `lastTime = null`, preventing burst spawning after tab-hide.

---

## 14. Renderer

One file, organized into clearly named private functions:

```js
// renderer.js
export class Renderer {
  constructor(fgCanvas, bgCanvas) {
    this.bgCtx = initCanvas(bgCanvas, WORLD.SIZE);
    this.fgCtx = initCanvas(fgCanvas, WORLD.SIZE);
  }

  init(geometry) {
    drawStaticIntersection(this.bgCtx, geometry);  // once, never again
  }

  draw(sim) {
    this.fgCtx.clearRect(0, 0, WORLD.SIZE, WORLD.SIZE);
    drawLights(this.fgCtx, sim.lights);
    drawCars(this.fgCtx, sim.allCars);
    drawHUD(this.fgCtx, sim.stats, sim.lights);
  }
}

// Private functions — not exported
function drawStaticIntersection(ctx, geometry) { ... }
function drawLights(ctx, lights) { ... }
function drawCars(ctx, cars) { ... }
function drawHUD(ctx, stats, lights) { ... }
```

If `renderer.js` grows past 350 lines, extract `drawStaticIntersection` into a `drawIntersection.js` helper. Do not pre-split.

### Two-Canvas Strategy

```html
<!-- index.html -->
<div id="canvas-container">
  <canvas id="bg"></canvas>   <!-- road, markings: drawn once -->
  <canvas id="fg"></canvas>   <!-- cars, lights, HUD: cleared each frame -->
</div>
```

```css
#canvas-container { position: relative; width: 800px; height: 800px; }
#bg, #fg          { position: absolute; top: 0; left: 0; }
```

Static road drawn once to `bg`. Everything animated goes to `fg`. No per-frame road redraw cost.

---

## 15. Performance Discipline

At this simulation scale (20–40 cars), performance is not a concern. The one discipline worth observing is **allocation timing**:

- Object allocations (new cars, new path objects) happen during **spawn only**.
- Per-frame update loops should not create new arrays, objects, or closures.
- Use `for` loops over `forEach` in hot paths — minor, but avoids allocating a closure per frame.

```js
// Prefer this in the per-frame update loop:
for (let i = 0; i < lane.queue.length; i++) { ... }

// Over this (allocates a closure each frame):
lane.queue.forEach(car => { ... });
```

This is the only performance constraint that matters at this scale. Don't optimize beyond it.

---

## 16. High-ROI Polish Details

Five additions that take under 30 minutes combined and meaningfully improve perceived quality.

### 1. Seeded RNG

```js
// utils.js
export function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
```

Pass seed via URL param (`?seed=42`) or the controls UI. Combined with `reset()`, this makes any simulation run exactly reproducible.

### 2. Pause on Tab Hidden

Already shown in §10. One event listener. Prevents the simulation from accumulating a large delta while the tab is backgrounded.

### 3. Queue Count in HUD

```
Phase:    NS STRAIGHT   ████████░░  12.4s
Queued:   N:3  S:1  E:0  W:2
Passed:   47 cars  |  Avg wait: 8.3s
```

Queue counts are free because lanes own their queues. They directly demonstrate that the underlying data model is working correctly — which is exactly what a technical reviewer wants to see.

### 4. Crisp 1px Canvas Lines

```js
// After ctx.scale(dpr, dpr), before drawing static content:
ctx.translate(0.5, 0.5);
```

Without this, 1px strokes straddle pixel boundaries and render as blurry 2px lines. A half-pixel translation keeps them crisp. Apply once to `bgCtx` at init; apply fresh each frame to `fgCtx` after `clearRect`.

### 5. Brake Lights

When `car.speed < 0.5 * CAR.MAX_SPEED`, draw two small filled red circles at the car's rear. Pure canvas geometry, ~5 lines. Adds significant visual clarity to queuing behavior.

**Skip:** dark/light theme toggle, sound, fancy gradients. These cost time and don't demonstrate simulation engineering.

---

## 17. Controls UI

Minimal, outside the canvas:

```
[▶ / ⏸]   Speed: [×0.5] [×1] [×2] [×4]   [↺ Reset]   Seed: [____]
```

Plain HTML buttons below the canvas. CSS: `display: flex; gap: 8px; padding: 8px;`. Done in 20 minutes. No canvas-based UI.

Add `D` key to toggle debug overlay (sensor zone bounds, bezier paths, car state labels) as a stretch goal only — after core simulation is confirmed correct.

---

## 18. MVP Scope

### In MVP
- Four-way intersection, correct lane geometry
- Cars spawn at controlled intervals, queue correctly, move through, despawn
- Traffic phases: NS_STRAIGHT → NS_YELLOW → ALL_RED → NS_LEFT → ALL_RED → EW → (repeat)
- Protected left-turn signal head
- Cars obey all lights — no right-on-red in MVP, all intents wait for main green
- Sensor-aware phase extension for non-fixed phases
- HUD: phase, timer, queue counts, throughput, average wait
- Controls: play/pause, speed multiplier, reset, seed input

### Stretch Goals (only if core is solid)
- Right-turn-on-red (one condition in `canEnterIntersection`)
- Pedestrian walk buttons + ALL_RED ped phase
- Debug overlay (sensor zones, waypoints, car state labels)
- Arrival rate slider
- Flashing orange / permissive left

### Explicitly Cut
- Ambulance / priority vehicles
- Multiple intersections
- Replay / recording
- Any network or persistence

---

## 19. Build Order

```
Step 1 — Setup (20 min)
  □ Scaffold: index.html, style.css, src/ files
  □ Vite dev server running (npm create vite@latest or plain npx vite)
  □ constants.js with first-pass values
  □ DPR-aware canvas init confirmed — check on a Retina display early

Step 2 — Static World (30 min)
  □ geometry.js: lane positions, stop lines, bezier waypoints
  □ renderer.js: draw road, lanes, markings to bg canvas
  □ Confirm coordinates match the documented heading conventions

Step 3 — Loop + Cars Moving (30 min)
  □ Loop in main.js: rAF, delta clamping, tab-hide reset
  □ Car entity shape, carManager spawn + straight movement (approaching → exiting)
  □ renderer draws cars as rounded rects

Step 4 — Traffic Control (40 min)
  □ trafficController.js: phase table, fixed/adaptive timing, light derivation
  □ renderer draws signal heads correctly per phase
  □ canEnterIntersection() gating; cars stop at red, go on green

Step 5 — Queue System (30 min)
  □ Lane-owned queues with correct stopLine offset (§2 coordinate rules)
  □ Deterministic queue positions, multi-car spacing
  □ Queue/crossing boundary: shift on departure, no queue writes during crossing

Step 6 — Left Turns (30 min)
  □ Bezier paths in geometry.js for left-turn intent
  □ Protected left-turn phase activates correctly
  □ Left-turn arrow signal head renders; canEnterIntersection checks leftArrow

Step 7 — Sensors + Adaptive Timing (20 min)
  □ sensorSystem.js reading lane.queue.length per lane
  □ trafficController extends/cuts adaptive phases on demand

Step 8 — Polish + HUD (30 min)
  □ HUD: queue counts, phase progress bar, throughput, avg wait
  □ Brake lights, seeded RNG, car color variety
  □ Controls UI: play/pause, speed, reset, seed

Step 9 — Stretch Goals (remaining time)
  □ Right-on-red, pedestrian phase, debug overlay
  □ README
```

---

## 20. Constants File

```js
// constants.js — all magic numbers live here, nowhere else

export const WORLD = {
  SIZE:            800,
  CENTER:          400,
  DESPAWN_MARGIN:   40,
};

export const ROAD = {
  LANE_WIDTH:       14,
  APPROACH_WIDTH:   56,   // 4 lanes × 14px
  MEDIAN_WIDTH:      4,
};

export const CAR = {
  LENGTH:           18,
  WIDTH:            10,
  MAX_SPEED:        90,   // px / sim-second
  CROSSING_SPEED_T:  0.4, // bezier t-units per sim-second
  FOLLOW_GAP:        6,   // px between bumpers in queue
  EXIT_TIMEOUT:      8,   // seconds — safety despawn for stuck cars
};

export const PHASE = {
  YELLOW_DURATION:    3,
  ALL_RED_DURATION:   2,
  MIN_GREEN_STRAIGHT: 15,
  MAX_GREEN_STRAIGHT: 40,
  MIN_GREEN_LEFT:      8,
  MAX_GREEN_LEFT:     20,
};

export const SPAWN = {
  INTERVAL:     2.5,
  MAX_CARS:     20,
  MAX_PER_LANE:  4,
};

export const SIGNAL = {
  LIGHT_RADIUS:    6,   // px — radius of each signal bulb
  HEAD_WIDTH:     18,   // px — signal housing width
  HEAD_HEIGHT:    52,   // px — signal housing height (3 bulbs + padding)
  HEAD_SPACING:    4,   // px — gap between bulbs
  ARROW_SIZE:      5,   // px — protected left arrow indicator
};

export const HUD = {
  FONT:         '12px monospace',
  FONT_LABEL:   '11px monospace',
  PADDING:      12,    // px — inner padding of HUD panel
  LINE_HEIGHT:  18,    // px
  BAR_WIDTH:   100,    // px — phase progress bar width
};
```

No number appears twice anywhere in the codebase. Renderer magic numbers go in `SIGNAL` and `HUD`. This prevents the renderer from accumulating its own scattered literals.

---

## 21. Engineering Judgment Signals for Reviewers

| Signal | What it shows |
|---|---|
| Lane-owned queues | Data modeling instinct — the right owner for the right data |
| `canEnterIntersection()` as a single function | Permission logic centralized, not scattered |
| Queue/crossing ownership boundary | Understanding of the snapping bug and how to prevent it |
| Phase table as a data array | Behavior encoded as data, not sprawling conditionals |
| Light state derived from phase table | Single source of truth discipline |
| `geometry.js` has no update logic | Clear separation of static config from runtime state |
| `renderer.js` never writes to simulation | Respected the stated contract under real implementation pressure |
| Unique ALL_RED phase IDs | Debugging was a first-class concern, not an afterthought |
| DPR-aware canvas setup | Attention to rendering quality on real hardware |
| stopLine = front-of-car, centerX = centerline | Coordinate ownership prevents a whole class of offset bugs |
| Delta clamping at `1/30` | Awareness of a real simulation pitfall |
| Tab-hide pause | Practical, shows understanding of the browser runtime environment |
| Seeded RNG + reset reproducibility | Reproducibility as a first-class concern |
| Queue counts in HUD | Feature that proves the underlying data model is working |
| Honest README with time budget | Intellectual honesty, appropriate scope calibration |

---

## 22. README Structure

```markdown
# Traffic Intersection Simulation

## What it does
One paragraph. Four-way intersection, lane-based queuing, adaptive signal timing.

## Running it
npm install && npm run dev

## Architecture
Three sentences: simulation owns state, renderer reads it, loop drives both.
Collision safety is structural: protected phases + ALL_RED intervals, not physics.

## Key Design Decisions
- Lane-owned queues (why this makes leader/follower, sensors, and spacing trivial)
- canEnterIntersection() (why signal permission lives in one place)
- Phase table as data (why this beats if/else chains)
- Two-canvas approach (why static road never redraws)
- Bezier turning with derivative heading (why it looks smooth without a physics engine)

## File Map
Annotated list of the 8 src files.

## Configuration
Point to constants.js. List the most useful knobs: SPAWN.INTERVAL, SPAWN.MAX_CARS, speed groups in PHASE.

## Time Spent
Honest per-step breakdown.

## What's missing
Right-on-red, pedestrian phases, debug overlay — and why they were cut.
```

---

*This plan targets a submission that reads as: thoughtful, practical, and complete — not a game engine, not a toy.*
