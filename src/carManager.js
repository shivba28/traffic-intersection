/**
 * Vehicle spawn, movement, signal obedience, and simple following (Step 6–7).
 * Intersection rules delegated to intersectionController.
 */

import { CAR, SPAWN, COLORS } from './constants.js';
import {
  APPROACH_ORDER,
  DESPAWN_BOUNDS,
  evalPath,
  pathTangentHeading,
  buildPathArcTable,
  pathArcLengthAtT,
  pathTAtArcLength,
  estimatePathT,
  getApproachForward,
  getApproachHeading,
  getInboundSpawnPoint,
  getInboundStopCenter,
  getPathForCar,
} from './geometry.js';

/** Center-to-center spacing while queued, on the path, and on the outbound leg. */
const PLATOON_SPACING = CAR.LENGTH + CAR.CROSSING_FOLLOW_GAP;

function pickCarColor(rng) {
  const palette = COLORS.CAR;
  return palette[Math.floor(rng() * palette.length)];
}

function findLane(lanes, laneId) {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i].id === laneId) return lanes[i];
  }
  return null;
}

function countCarsInLane(cars, laneId) {
  let n = 0;
  for (let i = 0; i < cars.length; i++) {
    if (cars[i].laneId === laneId) n++;
  }
  return n;
}

function lanesForApproach(lanes, approach) {
  const out = [];
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    if (lane.approach !== approach) continue;
    if (SPAWN.RIGHT_LANE_ONLY && lane.type !== 'right') continue;
    out.push(lane);
  }
  return out;
}

/** Straight and right use main green; left uses protected arrow. */
function movementTypeFromLane(lane) {
  return lane.type === 'left' ? 'left' : 'straight';
}

/** Center-to-center separation to the car ahead (approach axis and path arc when on maneuver). */
function separationToAhead(car, other) {
  const f = getApproachForward(car.approach);
  const along = (other.x - car.x) * f.x + (other.y - car.y) * f.y;
  if (other.state === 'crossing' || other.state === 'exiting') {
    const progress = maneuverProgress(other) - maneuverProgress(car);
    return along > 0.5 ? Math.min(along, progress) : progress;
  }
  return along;
}

/** Nearest car ahead in the same lane (inbound queue and cars on the turn / exit). */
function carAhead(car, cars) {
  let ahead = null;
  let minSep = Infinity;
  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other.id === car.id) continue;
    if (other.laneId !== car.laneId) continue;
    const sep = separationToAhead(car, other);
    if (sep > 0.5 && sep < minSep) {
      minSep = sep;
      ahead = other;
    }
  }
  return ahead;
}

/** Same-lane car furthest along the left-turn path (platoon leader on the curve). */
function crossingLead(car, cars) {
  let lead = null;
  let bestT = -1;
  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other.id === car.id || other.laneId !== car.laneId) continue;
    if (other.state !== 'crossing') continue;
    const t = other.pathT || 0;
    if (t > bestT) {
      bestT = t;
      lead = other;
    }
  }
  return lead;
}

/** Distance along turn path + outbound leg (meters from stop line). */
function maneuverProgress(car) {
  const path = car.crossingPath;
  if (!path) return 0;
  const pathLen = car.pathLength ?? 0;
  if (car.state === 'exiting' && car.travelForward) {
    const end = evalPath(path, 1);
    const out =
      (car.x - end.x) * car.travelForward.x + (car.y - end.y) * car.travelForward.y;
    return pathLen + Math.max(0, out);
  }
  if (car.state === 'crossing' && car.pathArc) {
    return pathArcLengthAtT(car.pathArc, car.pathT || 0);
  }
  return 0;
}

/** Nearest same-lane car ahead on the turn + exit (by maneuver arc length). */
function platoonAhead(car, cars) {
  const myS = maneuverProgress(car);
  let ahead = null;
  let bestSep = Infinity;

  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other.id === car.id || other.laneId !== car.laneId) continue;
    if (other.state !== 'crossing' && other.state !== 'exiting') continue;
    const sep = maneuverProgress(other) - myS;
    if (sep > 0.5 && sep < bestSep) {
      bestSep = sep;
      ahead = other;
    }
  }
  return ahead;
}

function isLeadInLane(car, cars) {
  return carAhead(car, cars) === null;
}

/** Enough spacing to enter behind a car already on the turn path or clearing the lane. */
function crossingEntryAllowed(car, cars) {
  const turnLead = crossingLead(car, cars);
  if (turnLead) {
    return maneuverProgress(turnLead) >= PLATOON_SPACING;
  }

  const ahead = carAhead(car, cars);
  if (!ahead) return true;

  if (ahead.state === 'exiting') {
    return followGapRoom(car, ahead) > 0;
  }

  return followGapRoom(car, ahead) > 0;
}

function platoonArcCap(car, cars) {
  const ahead = platoonAhead(car, cars);
  if (!ahead) return Infinity;
  return maneuverProgress(ahead) - PLATOON_SPACING;
}

function pathBlendFactor(car) {
  if (!usesCrossingPathBlend(car) || !car.pathArc) return 1;
  const s = pathArcLengthAtT(car.pathArc, car.pathT || 0);
  return Math.min(1, s / CAR.CROSSING_PATH_BLEND_DIST);
}

function snapCarOntoPath(car, path, t) {
  car.pathT = t;
  const pt = evalPath(path, t);
  car.x = pt.x;
  car.y = pt.y;
  car.heading = pathTangentHeading(path, t);
}

function applyPathPosition(car, path, t) {
  const blend = pathBlendFactor(car);
  if (blend >= 1) {
    snapCarOntoPath(car, path, t);
    return;
  }
  car.pathT = t;
  const pt = evalPath(path, t);
  car.x += (pt.x - car.x) * blend;
  car.y += (pt.y - car.y) * blend;
  const pathH = pathTangentHeading(path, t);
  let diff = pathH - car.heading;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  car.heading += diff * blend;
}

/** Right turns ease onto the curve; straight/left snap once aligned at the stop. */
function usesCrossingPathBlend(car) {
  return car.laneType === 'right';
}

/** Straight and left: snap at crossing entry instead of blending from approach. */
function snapsOntoCrossingPath(car) {
  return car.laneType === 'straight' || car.laneType === 'left';
}

/** At stop and on the lane path (straight/left — avoids warp on entry). */
function isReadyToEnterCrossing(car, lane, path) {
  if (!path) return false;
  if (!snapsOntoCrossingPath(car)) return true;
  if (distCenterToStop(car, lane) > CAR.STOP_SETTLE_EPSILON) return false;
  const t = estimatePathT(path, car.x, car.y);
  const pt = evalPath(path, t);
  const dx = pt.x - car.x;
  const dy = pt.y - car.y;
  return dx * dx + dy * dy <= CAR.LENGTH * CAR.LENGTH;
}

/** Right-turn crossing: ease speed up at curve entry. */
function usesCrossingAccelRamp(car) {
  return car.laneType === 'right';
}

function advanceCrossingSpeed(car, delta) {
  const target = CAR.MAX_SPEED;
  const v = car.speed ?? 0;
  if (!usesCrossingAccelRamp(car) || v >= target) return target;
  return Math.min(target, v + CAR.CROSSING_ACCEL * delta);
}

/** Move along turn path by arc length, preserving platoon spacing. */
function advanceCrossingPlatoon(sim, car, delta, ic) {
  const path = car.crossingPath;
  if (!path) return;

  if (!car.pathArc) {
    car.pathArc = buildPathArcTable(path);
    car.pathLength = car.pathArc.total;
  }

  const sBefore = pathArcLengthAtT(car.pathArc, car.pathT || 0);
  const sCap = platoonArcCap(car, sim.cars);
  // Full arc rate for platoon stagger; ramp only affects displayed speed / blend.
  const ds = CAR.MAX_SPEED * delta;
  const s = Math.min(sBefore + ds, sCap, car.pathLength);

  applyPathPosition(car, path, pathTAtArcLength(car.pathArc, s));
  const rampSpeed = advanceCrossingSpeed(car, delta);
  car.speed = s > sBefore + 1e-4 ? rampSpeed : 0;

  if (car.movementType === 'left' && s >= PLATOON_SPACING) {
    ic.releaseLeftTurnSlot(car);
  }

  if (car.pathT >= 1 - 1e-5) {
    if (ic.advanceCrossing(car, 0)) {
      car.state = 'exiting';
    }
  }
}

/** Move along outbound leg by arc length, preserving platoon spacing. */
function advanceExitingPlatoon(car, cars, delta) {
  const path = car.crossingPath;
  const f = car.travelForward;
  if (!path || !f) return;

  const pathLen = car.pathLength ?? 0;
  const sBefore = maneuverProgress(car);
  const sCap = platoonArcCap(car, cars);
  const ds = CAR.MAX_SPEED * delta;
  const s = Math.min(sBefore + ds, sCap);

  const exitDist = Math.max(0, s - pathLen);
  const end = evalPath(path, 1);
  car.x = end.x + f.x * exitDist;
  car.y = end.y + f.y * exitDist;
  car.heading = car.exitHeading;
  car.speed = s > sBefore + 1e-4 ? CAR.MAX_SPEED : 0;
}

function initialCrossingArc(sim, car, path) {
  const table = buildPathArcTable(path);
  const fromPos = snapsOntoCrossingPath(car)
    ? 0
    : pathArcLengthAtT(table, estimatePathT(path, car.x, car.y));
  const lead = crossingLead(car, sim.cars);
  if (!lead) return fromPos;
  const leadTable = lead.pathArc || table;
  const leadS = pathArcLengthAtT(leadTable, lead.pathT || 0);
  return Math.min(fromPos, Math.max(0, leadS - PLATOON_SPACING));
}

/**
 * Signal + queue + zone clearance (Step 7).
 * @param {import('./simulation.js').Simulation} sim
 */
function tryBeginCrossing(sim, car) {
  if (!crossingEntryAllowed(car, sim.cars)) return false;
  if (!sim.intersectionController.canProceed(sim, car)) return false;
  const lane = findLane(sim.lanes, car.laneId);
  const path = lane ? getPathForCar(car, lane) : null;
  const startArc = path ? initialCrossingArc(sim, car, path) : null;
  sim.intersectionController.beginCrossing(sim, car, startArc ?? undefined);
  if (snapsOntoCrossingPath(car) && car.crossingPath) {
    snapCarOntoPath(car, car.crossingPath, car.pathT || 0);
  }
  return true;
}

function spawnCar(sim, lane) {
  const pt = getInboundSpawnPoint(lane);
  sim.cars.push({
    id: sim.nextCarId++,
    laneId: lane.id,
    approach: lane.approach,
    laneType: lane.type,
    movementType: movementTypeFromLane(lane),
    x: pt.x,
    y: pt.y,
    heading: pt.heading,
    speed: CAR.MAX_SPEED,
    color: pickCarColor(sim.rng),
    state: 'moving',
    reservedZones: [],
  });
}

function trySpawn(sim) {
  if (sim.cars.length >= SPAWN.MAX_CARS) return;

  const start = sim.spawnApproachIndex;
  for (let a = 0; a < APPROACH_ORDER.length; a++) {
    const approach = APPROACH_ORDER[(start + a) % APPROACH_ORDER.length];
    const candidates = lanesForApproach(sim.lanes, approach);
    if (candidates.length === 0) continue;

    const offset = Math.floor(sim.rng() * candidates.length);
    for (let j = 0; j < candidates.length; j++) {
      const lane = candidates[(offset + j) % candidates.length];
      if (countCarsInLane(sim.cars, lane.id) >= SPAWN.MAX_PER_LANE) continue;

      spawnCar(sim, lane);
      sim.spawnApproachIndex = (start + a + 1) % APPROACH_ORDER.length;
      return;
    }
  }
}

/** Signed distance from car center to stop center along approach (+ = stop is ahead). */
function distCenterToStop(car, lane) {
  const stop = getInboundStopCenter(lane);
  const f = getApproachForward(car.approach);
  return (stop.x - car.x) * f.x + (stop.y - car.y) * f.y;
}

/** Room to move before violating minimum follow gap behind the car ahead. */
function followGapRoom(car, ahead) {
  if (!ahead) return Infinity;
  return separationToAhead(car, ahead) - CAR.LENGTH - CAR.FOLLOW_GAP;
}

function speedForStopApproach(dist) {
  if (dist <= CAR.STOP_SETTLE_EPSILON) return 0;
  if (dist >= CAR.STOP_DECEL_ZONE) return CAR.MAX_SPEED;
  return CAR.MAX_SPEED * (dist / CAR.STOP_DECEL_ZONE);
}

function moveAlongApproach(car, distance) {
  if (distance <= 0) return;
  const f = getApproachForward(car.approach);
  car.x += f.x * distance;
  car.y += f.y * distance;
  car.heading = getApproachHeading(car.approach);
}

function settleAtStop(car, lane) {
  const stop = getInboundStopCenter(lane);
  car.x = stop.x;
  car.y = stop.y;
  car.speed = 0;
}

function holdInQueue(car) {
  car.speed = 0;
}

function markWaiting(car, lane, cars) {
  if (isLeadInLane(car, cars) && distCenterToStop(car, lane) <= CAR.STOP_SETTLE_EPSILON) {
    settleAtStop(car, lane);
  } else {
    holdInQueue(car);
  }
  car.state = 'stopped';
}

/**
 * Inbound movement: decelerate for stop line and/or car ahead; stop on red or zone wait.
 * @param {import('./simulation.js').Simulation} sim
 */
function updateInbound(sim, car, lane, delta) {
  const distToStop = distCenterToStop(car, lane);
  const ahead = carAhead(car, sim.cars);
  const gapRoom = followGapRoom(car, ahead);
  const green = sim.trafficController.canMove(car.approach, car.movementType);
  const path = getPathForCar(car, lane);

  if (car.state === 'stopped') {
    if (!green) {
      const lead = isLeadInLane(car, sim.cars);
      if (lead && distToStop <= CAR.STOP_SETTLE_EPSILON) {
        settleAtStop(car, lane);
      } else {
        holdInQueue(car);
      }
    }
    if (isReadyToEnterCrossing(car, lane, path)) {
      if (tryBeginCrossing(sim, car)) return;
    }
    if (gapRoom > 0) {
      car.state = 'moving';
    }
    return;
  }

  if (green && crossingEntryAllowed(car, sim.cars)) {
    if (isReadyToEnterCrossing(car, lane, path) && tryBeginCrossing(sim, car)) return;
  }

  // On green, yield only to the car ahead — not the stop line (no "stop sign" pause).
  const obeyStopLine = !green;
  const stopRoom = obeyStopLine
    ? Math.max(0, distToStop - CAR.STOP_SETTLE_EPSILON)
    : Infinity;
  let spaceRoom = obeyStopLine ? Math.min(stopRoom, gapRoom) : gapRoom;
  // Straight/left: don't coast past the line on green — enter the path instead of warping.
  if (green && snapsOntoCrossingPath(car)) {
    spaceRoom = Math.min(spaceRoom, Math.max(0, distToStop + CAR.STOP_SETTLE_EPSILON));
  }
  const brakeDist = obeyStopLine ? Math.min(distToStop, gapRoom) : gapRoom;

  if (spaceRoom <= 0) {
    car.speed = 0;
    if (distToStop <= CAR.STOP_SETTLE_EPSILON) {
      if (tryBeginCrossing(sim, car)) return;
      if (!green) markWaiting(car, lane, sim.cars);
    } else {
      car.state = 'moving';
    }
    return;
  }

  const speed = speedForStopApproach(brakeDist);
  const step = Math.min(speed * delta, spaceRoom);
  moveAlongApproach(car, step);
  car.speed = step > 0 ? speed : 0;
  car.state = 'moving';

  if (distToStop <= CAR.STOP_SETTLE_EPSILON) {
    if (tryBeginCrossing(sim, car)) return;
    if (!green) markWaiting(car, lane, sim.cars);
  }
}

function updateCar(sim, car, delta) {
  const lane = findLane(sim.lanes, car.laneId);
  if (!lane) return;

  const ic = sim.intersectionController;

  if (car.state === 'crossing') {
    advanceCrossingPlatoon(sim, car, delta, ic);
    ic.updateOccupancy(sim, car);
    return;
  }

  if (car.state === 'exiting') {
    advanceExitingPlatoon(car, sim.cars, delta);
    ic.updateOccupancy(sim, car);
    return;
  }

  if (car.state === 'moving' || car.state === 'stopped') {
    updateInbound(sim, car, lane, delta);
  }
}

function isOutOfBounds(car) {
  const b = DESPAWN_BOUNDS;
  return (
    car.x < b.minX ||
    car.x > b.maxX ||
    car.y < b.minY ||
    car.y > b.maxY
  );
}

function despawnCar(sim, index) {
  const car = sim.cars[index];
  sim.intersectionController.release(car);
  sim.stats.throughput++;
  const last = sim.cars.length - 1;
  if (index !== last) {
    sim.cars[index] = sim.cars[last];
  }
  sim.cars.pop();
}

/**
 * @param {import('./simulation.js').Simulation} sim
 * @param {number} delta
 */
export function updateCars(sim, delta) {
  sim.spawnTimer += delta;
  if (sim.spawnTimer >= SPAWN.INTERVAL) {
    sim.spawnTimer = 0;
    trySpawn(sim);
  }

  for (let i = 0; i < sim.cars.length; i++) {
    if (sim.cars[i].state === 'stopped') {
      sim.stats.totalWaitTime += delta;
    }
  }

  const sorted = [...sim.cars].sort(
    (a, b) => platoonSortKey(b) - platoonSortKey(a)
  );
  const toDespawn = [];

  for (let i = 0; i < sorted.length; i++) {
    const car = sorted[i];
    updateCar(sim, car, delta);
    if (isOutOfBounds(car)) toDespawn.push(car);
  }

  for (let i = 0; i < toDespawn.length; i++) {
    const idx = sim.cars.indexOf(toDespawn[i]);
    if (idx !== -1) despawnCar(sim, idx);
  }
}

/** Leaders update before followers for stable platoon spacing. */
function platoonSortKey(car) {
  return maneuverProgress(car);
}
