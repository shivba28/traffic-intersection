# Lane-owned queue implementation
_Exported on 5/15/2026 at 16:05:46 PDT from Cursor (3.3.22)_

---

**User**

Implement lane-owned queues in a minimal, non-breaking way.

Goal:
Each lane should maintain a `queue[]` array that reflects the ordered cars waiting on that lane (approach + lane). This queue should NOT replace the existing movement logic (carAhead, etc.), only mirror it for future sensor use.

Requirements:

1. Data Model
- Each lane object in geometry.js should have:
  - queue: [] (array of car ids or car references)

2. Queue Population (carManager.js)
- When a car spawns:
  - Assign it to a lane (already exists)
  - Push it to lane.queue

- Maintain queue order based on distance to stop line:
  - Closest to stop line = index 0
  - Cars behind follow in order

3. Queue Updates (every tick)
- In update loop (carManager.js or simulation.js):
  - For each lane:
    - Rebuild queue by:
      a. Filtering sim.cars for cars in that lane AND not yet in crossing state
      b. Sorting them by distance to stop line (ascending)

- Do NOT rely on insertion order — always recompute to guarantee correctness

4. Removal Conditions
- When a car:
  - Enters intersection (crossing state), OR
  - Despawns
  → it must NOT appear in lane.queue

5. Non-breaking rule
- DO NOT modify:
  - carAhead()
  - movement logic
  - intersectionController
  - trafficController

- lane.queue is read-only for now (used only for sensors later)

6. Debug (temporary)
- Add optional console log or debug flag:
  - Print lane id + queue length
  - Helps verify correctness

7. Keep it clean
- No side effects in geometry.js
- All updates happen in simulation/carManager layer

Return:
- Updated lane structure
- Queue rebuild logic
- Any helper functions added

---

**Cursor**

Exploring the codebase to see how lanes and cars are structured before implementing lane-owned queues.


Lane objects already include `queue: []` in `createLanes()`. Implementing queue population and per-tick rebuild in `carManager.js`.


Lane-owned queues are wired up with a small, non-breaking layer on top of the existing simulation.

### Data model (`geometry.js` — already present)

Inbound lanes from `createLanes()` each get an empty `queue`:

```289:297:src/geometry.js
export function createLanes() {
  const lanes = [];
  for (let g = 0; g < APPROACH_LANE_GROUPS.length; g++) {
    const group = APPROACH_LANE_GROUPS[g];
    for (let i = 0; i < group.inbound.length; i++) {
      lanes.push({ ...group.inbound[i], queue: [] });
    }
  }
  return lanes;
}
```

No runtime logic was added in geometry.

### Queue logic (`carManager.js`)

- **`isQueuedOnLane(car)`** — only `moving` / `stopped` (approach wait; excludes `crossing` / `exiting`)
- **`rebuildLaneQueues(sim)`** — per lane: filter `sim.cars`, sort by `distCenterToStop` ascending (index 0 = closest to stop line), write car **ids** into `lane.queue`
- **`spawnCar`** — pushes new car id onto `lane.queue` at spawn (authoritative order still comes from rebuild)
- **`updateCars`** — calls `rebuildLaneQueues(sim)` after movement and despawn

`carAhead()`, movement, `intersectionController`, and `trafficController` are unchanged.

### Debug (`constants.js`)

```javascript
export const DEBUG_LANE_QUEUES = false;
```

Set to `true` to log `laneId queue=N` each tick during rebuild.

### Verification

A quick simulation run confirmed queued cars match inbound `moving`/`stopped` counts and no crossing/exiting cars appear in queues.

To inspect live, set `DEBUG_LANE_QUEUES = true` in `src/constants.js` and watch the console while the sim runs. `readSensors()` in `sensorSystem.js` already reads `lane.queue.length` and will pick up the rebuilt values automatically.

---

**User**

Implement Step 7: Sensor-based adaptive timing using existing lane.queue data.

Goal:
Use lane-owned queues to dynamically EXTEND or CUT SHORT green phases. Do NOT replace the phase system — only enhance timing.

Scope:
- sensorSystem.js → produce demand data
- trafficController.js → consume it to adjust phase duration
- NO changes to car movement, intersectionController, or geometry

-----------------------------------
1. Sensor System (sensorSystem.js)
-----------------------------------

Update readSensors(sim):

Return structured demand data per axis:

{
  NS: {
    straight: number,
    left: number
  },
  EW: {
    straight: number,
    left: number
  }
}

Implementation details:
- Loop through all lanes
- Use lane.queue.length
- Separate counts by:
  - axis (NS or EW)
  - movementType ("straight" or "left")

Return totals (sum of all relevant lanes)

-----------------------------------
2. Traffic Controller Integration
-----------------------------------

In trafficController.js:

A. Track phase timing
- Add:
  phaseElapsedTime
  currentPhaseMin
  currentPhaseMax

B. On phase start:
- Set:
  phaseElapsedTime = 0
  currentPhaseMin = PHASE.MIN_*
  currentPhaseMax = PHASE.MAX_*

C. During update(delta):
- Increment:
  phaseElapsedTime += delta

-----------------------------------
3. Adaptive Extension Logic
-----------------------------------

During GREEN phases only:

- Get sensor data:
  const demand = readSensors(sim)

- Determine current active axis (NS or EW)
- Determine movement type (straight or left)

Define:
- activeDemand = demand for current phase
- opposingDemand = demand for next phase

Rules:

1. Minimum guarantee
- Do NOT switch phase before currentPhaseMin

2. Extend green if demand exists
- If activeDemand > 0:
    allow phase to continue up to currentPhaseMax

3. Early cut if no demand
- If activeDemand === 0 AND phaseElapsedTime >= currentPhaseMin:
    advance phase early

4. Hard cap
- If phaseElapsedTime >= currentPhaseMax:
    advance phase no matter what

-----------------------------------
4. Phase Switching
-----------------------------------

Do NOT modify PHASES structure.

Only modify the condition that decides when to advance to next phase.

-----------------------------------
5. Safety Constraints
-----------------------------------

- DO NOT skip:
  - yellow phase
  - all-red phase

- Adaptive logic ONLY applies to:
  - straight green phases
  - left-turn green phases

-----------------------------------
6. Debug Logging (temporary)
-----------------------------------

Add logs:

console.log({
  phase: currentPhase,
  elapsed: phaseElapsedTime,
  demand: activeDemand
})

-----------------------------------
7. Non-breaking Requirement
-----------------------------------

- Do NOT change:
  - canMove()
  - intersectionController
  - carManager movement logic

-----------------------------------
Return:
- Updated readSensors()
- Adaptive timing logic in trafficController
- Any helper functions added

---

**Cursor**

Implementing sensor-based adaptive timing. Reviewing the traffic controller, sensor system, and lane structure.


Implementing sensor demand aggregation and adaptive phase timing. Updating simulation tick order so queues are rebuilt before the traffic controller reads them.


Step 7 is implemented: queue-based demand drives green phase length without changing movement or the phase table.

### `sensorSystem.js` — `readSensors(sim)`

Returns axis/movement totals from `lane.queue.length`:

```javascript
{
  NS: { straight: number, left: number },
  EW: { straight: number, left: number }
}
```

Lanes map to **NS/EW** via `SIGNAL_AXIS`, and to **straight/left** via `lane.type === 'left'` (same rule as `movementTypeFromLane` in carManager).

### `trafficController.js` — adaptive timing

- **Tracking:** `phaseElapsedTime`, `currentPhaseMin`, `currentPhaseMax` (set on each phase entry via `_initPhaseTiming()`)
- **`update(sim, delta)`** — reads `readSensors(sim)` each sub-step
- **Advance rules** (only when `phase.fixed === false` — green straight/left):
  1. Never advance before `currentPhaseMin`
  2. Hold green while `activeDemand > 0`, up to `currentPhaseMax`
  3. Early advance at min if `activeDemand === 0`
  4. Always advance at `currentPhaseMax`
- **Yellow / all-red** — unchanged fixed timing (`phase.fixed === true`)
- **`canMove()`** — untouched
- **Debug:** set `DEBUG_ADAPTIVE_TIMING = true` in `constants.js` for `{ phase, elapsed, demand }` logs

Helpers: `adaptiveDemandKey()`, `_activeDemand()`, `_shouldAdvancePhase()`, `_advanceThreshold()`.

### `simulation.js`

Tick order is now **cars → traffic** so `rebuildLaneQueues()` runs before sensors are read.

### Debug flags (`constants.js`)

- `DEBUG_ADAPTIVE_TIMING = false` (new)
- `DEBUG_LANE_QUEUES` reset to `false` (was left on)

### Behavior note

Demand is **queue depth**, not total cars. Once vehicles roll through on green, queues empty and the phase can end at **min** even if traffic was heavy earlier. With `MIN_GREEN_STRAIGHT = 9` and `MAX = 10`, extension is at most **1 second** while cars remain queued; widen that gap in `PHASE` if you want a more visible effect in the sim.

---

**User**

Add a YELLOW phase specifically for protected left turns to prevent visual collisions.

Goal:
After each protected left-turn GREEN phase, insert a LEFT-YELLOW phase where:
- No new cars can enter the intersection for that movement
- Cars already in the intersection can finish their turn

-----------------------------------
1. Update PHASES (trafficController.js)
-----------------------------------

For each protected left phase, insert a new phase immediately after it:

Example (NS axis):

Before:
NS_LEFT_GREEN → EW_STRAIGHT_GREEN

After:
NS_LEFT_GREEN → NS_LEFT_YELLOW → ALL_RED → EW_STRAIGHT_GREEN

Do this for both axes (NS and EW).

-----------------------------------
2. Define LEFT_YELLOW Behavior
-----------------------------------

In the new LEFT_YELLOW phase:

- Left turn signal = YELLOW
- Straight signals for that axis = RED
- Opposing axis = RED

This means:
- No cars should ENTER from that lane
- Cars already in intersection can continue

-----------------------------------
3. Update Light Derivation Logic
-----------------------------------

In trafficController light logic:

- Add handling for LEFT_YELLOW:
  - leftArrow = "yellow"
  - straight = "red"

Ensure renderer reflects yellow arrow if applicable

-----------------------------------
4. Update canMove()
-----------------------------------

Modify canMove(lane, car):

For LEFT_YELLOW phase:
- If car is BEFORE stop line:
    return false (do NOT allow new entry)

- If car is already in crossing state:
    allow it to continue (no change needed if already handled elsewhere)

IMPORTANT:
- Do NOT block cars already inside intersection
- Only block new entrants

-----------------------------------
5. Timing
-----------------------------------

Use existing:
PHASE.YELLOW_DURATION

Apply it to LEFT_YELLOW phases.

-----------------------------------
6. Phase Transition Rules
-----------------------------------

Ensure transitions look like:

LEFT_GREEN → LEFT_YELLOW → ALL_RED → NEXT PHASE

DO NOT skip ALL_RED

-----------------------------------
7. Non-breaking Constraints
-----------------------------------

- DO NOT modify:
  - intersectionController
  - car movement logic
  - bezier paths

- ONLY control:
  - signal state
  - canMove()

-----------------------------------
8. Debug (temporary)
-----------------------------------

Log phase transitions:

console.log("Phase:", currentPhase)

-----------------------------------
Return:
- Updated PHASES with LEFT_YELLOW phases
- Updated light derivation
- Updated canMove logic

---

**Cursor**

Verifying whether protected left-turn YELLOW phases are already implemented.


This is already implemented in your repo. Here’s what’s in place:

### Phase sequence (12 phases)

```
NS_LEFT → NS_LEFT_YELLOW → ALL_RED_NS_TO_EW → EW_STRAIGHT → …
EW_LEFT → EW_LEFT_YELLOW → ALL_RED_EW_TO_NS
```

`NS_LEFT_YELLOW` / `EW_LEFT_YELLOW` use `PHASE.YELLOW_DURATION` (3s), are `fixed: true`, and sit **before** each all-red clearance (all-red is not skipped).

### Signal states

```81:88:src/trafficController.js
  {
    id: 'NS_LEFT_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.YELLOW },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  },
```

(EW mirror: yellow arrow on `ew`, everything else red.)

Lights come from the declarative `PHASES` rows via `lightsFromPhase()` — no extra derivation logic needed.

### `canMove()`

- Left entry only when arrow is **green** (yellow/off → `false` for cars before the intersection).
- Optional `car` argument: `crossing` / `exiting` left turns return `true` so in-intersection cars aren’t blocked if something passes the car in.
- `intersectionController` and `carManager` movement are unchanged; inbound cars never get green on yellow, and cars already turning don’t re-check `canMove` during the maneuver.

### Renderer

Yellow left arrow is drawn when `leftArrow === 'yellow'` (`drawArrowLamp` already supports it).

### Debug

Set `DEBUG_PHASE_TRANSITIONS = true` in `constants.js` to log `Phase: <id>` on each transition.

No further code changes are required for this request. If you’re still seeing visual collisions, describe the scenario (axis, phase, car states) and we can tune timing or entry checks.

