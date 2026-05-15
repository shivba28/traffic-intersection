/**
 * Spawn, move, despawn + signal obedience (Step 4 — no queues or turning yet).
 */

import { CAR, SPAWN, COLORS } from './constants.js';
import {
  APPROACH_ORDER,
  DESPAWN_BOUNDS,
  getApproachForward,
  getApproachHeading,
  getInboundSpawnPoint,
  getInboundStopCenter,
  isPastIntersectionCenter,
} from './geometry.js';

/**
 * Single place for signal permission (architecture §4).
 * @param {{ queueIndex?: number, approach: string, intent: string }} car
 * @param {Record<string, { main: string, leftArrow: string }>} lights
 * @returns {boolean}
 */
export function canEnterIntersection(car, lights) {
  if (car.queueIndex !== undefined && car.queueIndex !== 0) return false;
  const signal = lights[car.approach];
  if (!signal) return false;
  if (car.intent === 'left') {
    return signal.leftArrow === 'green';
  }
  return signal.main === 'green';
}

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
    if (lanes[i].approach === approach) out.push(lanes[i]);
  }
  return out;
}

/** Closest to intersection along approach axis (lead car for this phase). */
function isLeadInLane(car, cars) {
  const f = getApproachForward(car.approach);
  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other.id === car.id || other.laneId !== car.laneId) continue;
    if (other.state === 'exiting') continue;
    const ahead =
      (other.x - car.x) * f.x + (other.y - car.y) * f.y > 0.5;
    if (ahead) return false;
  }
  return true;
}

function spawnCar(sim, lane) {
  const pt = getInboundSpawnPoint(lane);
  const intent = lane.type === 'straight' ? 'straight' : lane.type;
  sim.cars.push({
    id: sim.nextCarId++,
    laneId: lane.id,
    approach: lane.approach,
    intent,
    x: pt.x,
    y: pt.y,
    heading: pt.heading,
    speed: CAR.MAX_SPEED,
    color: pickCarColor(sim.rng),
    state: 'approaching',
    queueIndex: 0,
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

/** Ease speed down as the car nears the single stop target. */
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

function moveCarForward(car, delta) {
  const f = getApproachForward(car.approach);
  const step = CAR.MAX_SPEED * delta;
  car.speed = CAR.MAX_SPEED;
  car.x += f.x * step;
  car.y += f.y * step;
  car.heading = getApproachHeading(car.approach);
}

/**
 * Lead car approaching a stop: clamp movement so center never passes stop center.
 */
function updateApproachingLead(sim, car, lane, delta, lights) {
  let dist = distCenterToStop(car, lane);

  if (dist <= CAR.STOP_SETTLE_EPSILON) {
    settleAtStop(car, lane);
    if (canEnterIntersection(car, lights)) {
      car.state = 'crossing';
      car.speed = CAR.MAX_SPEED;
    } else {
      car.state = 'waiting';
    }
    return;
  }

  const speed = speedForStopApproach(dist);
  const step = speed * delta;
  const move = Math.min(step, dist);

  moveAlongApproach(car, move);
  car.speed = speed;

  dist = distCenterToStop(car, lane);
  if (dist <= CAR.STOP_SETTLE_EPSILON) {
    settleAtStop(car, lane);
    if (canEnterIntersection(car, lights)) {
      car.state = 'crossing';
      car.speed = CAR.MAX_SPEED;
    } else {
      car.state = 'waiting';
    }
  }
}

function updateCar(sim, car, delta) {
  const lights = sim.trafficController.lights;
  const lane = findLane(sim.lanes, car.laneId);
  if (!lane) return;

  if (car.state === 'waiting') {
    settleAtStop(car, lane);
    if (canEnterIntersection(car, lights)) {
      car.state = 'crossing';
      car.speed = CAR.MAX_SPEED;
    }
    return;
  }

  if (car.state === 'crossing') {
    moveCarForward(car, delta);
    if (isPastIntersectionCenter(car)) {
      car.state = 'exiting';
    }
    return;
  }

  if (car.state === 'exiting') {
    moveCarForward(car, delta);
    return;
  }

  if (car.state === 'approaching') {
    if (isPastIntersectionCenter(car)) {
      car.state = 'exiting';
      moveCarForward(car, delta);
      return;
    }

    if (isLeadInLane(car, sim.cars)) {
      updateApproachingLead(sim, car, lane, delta, lights);
      return;
    }

    moveCarForward(car, delta);
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
    const car = sim.cars[i];
    if (car.state === 'waiting') {
      sim.stats.totalWaitTime += delta;
    }
  }

  for (let i = sim.cars.length - 1; i >= 0; i--) {
    updateCar(sim, sim.cars[i], delta);
    if (isOutOfBounds(sim.cars[i])) {
      despawnCar(sim, i);
    }
  }
}
