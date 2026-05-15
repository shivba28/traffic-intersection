/**
 * Intersection occupancy, per-lane entry queue, and crossing paths (Step 7).
 * Combines with trafficController.canMove() — both must allow entry.
 */

import { CAR } from './constants.js';
import {
  evalPath,
  pathTangentHeading,
  pathTangentUnit,
  estimatePathT,
  buildPathArcTable,
  pathArcLengthAtT,
  pathTAtArcLength,
  getApproachForward,
  getInboundStopCenter,
  getWaypointKey,
  getBezierPath,
  getPathForCar,
  zonesAlongPath,
  getIntersectionZoneRects,
  isOutsideIntersection,
} from './geometry.js';

function distCenterToStop(car, lane) {
  const stop = getInboundStopCenter(lane);
  const f = getApproachForward(car.approach);
  return (stop.x - car.x) * f.x + (stop.y - car.y) * f.y;
}

/** In the stop queue (at the line or still rolling up on green). */
function isWaitingAtIntersection(sim, car) {
  if (car.state === 'stopped') return true;
  if (car.state !== 'moving') return false;
  const lane = sim.lanes.find((l) => l.id === car.laneId);
  if (!lane) return false;
  return distCenterToStop(car, lane) <= CAR.STOP_DECEL_ZONE;
}

/** Toggle debug overlays in renderer.js */
export const DEBUG_INTERSECTION = {
  showIntersectionZones: false,
  showReservedCars: false,
};

const ZONE_IDS = ['NW', 'NE', 'SW', 'SE'];

/** Dedicated straight-through lanes (not left/right turn lanes). */
function isDedicatedStraightLane(car) {
  return car.laneType === 'straight';
}

export class IntersectionController {
  constructor() {
    /** @type {Record<string, number | null>} */
    this.zones = { NW: null, NE: null, SW: null, SE: null };
    /** @type {Record<string, number[]>} laneId → waiting car ids (FIFO) */
    this.laneQueues = {};
  }

  reset() {
    this.zones = { NW: null, NE: null, SW: null, SE: null };
    this.laneQueues = {};
  }

  getZoneRects() {
    return getIntersectionZoneRects();
  }

  requiredZones(car, sim) {
    // Per-approach slot so opposing lefts (e.g. E→S and W→N on same arrow) are not
    // serialized by shared quadrant geometry along both paths.
    if (car.movementType === 'left') {
      return [`LT_${car.approach}`];
    }
    const lane = sim.lanes.find((l) => l.id === car.laneId) || null;
    return zonesAlongPath(getPathForCar(car, lane));
  }

  _laneQueue(laneId) {
    if (!this.laneQueues[laneId]) this.laneQueues[laneId] = [];
    return this.laneQueues[laneId];
  }

  enqueue(car) {
    const q = this._laneQueue(car.laneId);
    if (q.indexOf(car.id) === -1) q.push(car.id);
  }

  removeFromQueue(car) {
    const q = this._laneQueue(car.laneId);
    const idx = q.indexOf(car.id);
    if (idx !== -1) q.splice(idx, 1);
  }

  /** Drop cars that left the stop line or no longer exist (prevents ghost queue heads). */
  _pruneLaneQueue(sim, laneId) {
    const q = this._laneQueue(laneId);
    for (let i = q.length - 1; i >= 0; i--) {
      const waiter = sim.cars.find((c) => c.id === q[i]);
      const lane = sim.lanes.find((l) => l.id === laneId);
      if (
        !waiter
        || waiter.laneId !== laneId
        || !lane
        || !isWaitingAtIntersection(sim, waiter)
      ) {
        q.splice(i, 1);
      }
    }
  }

  /** FIFO head of this lane's queue only (parallel lanes can flow together). */
  hasQueuePriority(sim, car) {
    this._pruneLaneQueue(sim, car.laneId);
    const q = this._laneQueue(car.laneId);
    return q.length === 0 || q[0] === car.id;
  }

  zonesAvailable(sim, car) {
    const needed = this.requiredZones(car, sim);
    for (let i = 0; i < needed.length; i++) {
      const z = needed[i];
      const holder = this.zones[z];
      if (holder != null && holder !== car.id) return false;
    }
    return true;
  }

  reserve(sim, car) {
    const needed = this.requiredZones(car, sim);
    car.reservedZones = needed;
    for (let i = 0; i < needed.length; i++) {
      this.zones[needed[i]] = car.id;
    }
  }

  release(car) {
    const held = car.reservedZones || [];
    for (let i = 0; i < held.length; i++) {
      const z = held[i];
      if (this.zones[z] === car.id) this.zones[z] = null;
    }
    car.reservedZones = [];
    this.removeFromQueue(car);
  }

  canProceed(sim, car) {
    if (!sim.trafficController.canMove(car.approach, car.movementType)) {
      this.removeFromQueue(car);
      return false;
    }

    // Parallel straight lanes share one path in zone math — allow concurrent
    // release on green with no FIFO queue or single-file zone slot.
    if (isDedicatedStraightLane(car)) {
      return true;
    }

    if (!isWaitingAtIntersection(sim, car)) {
      this.removeFromQueue(car);
      return false;
    }

    this.enqueue(car);
    if (!this.hasQueuePriority(sim, car)) return false;
    return this.zonesAvailable(sim, car);
  }

  /**
   * Lock exit direction from path end tangent (once). Inbound approach vectors
   * must NOT be used for exit — they point toward the intersection.
   */
  _lockExitTravel(car, path) {
    car.travelForward = pathTangentUnit(path, 1);
    car.exitHeading = pathTangentHeading(path, 1);
    car.heading = car.exitHeading;
  }

  /**
   * @param {import('./simulation.js').Simulation} sim
   * @param {object} car
   * @param {number} [startArc] arc-length from path start (platoon spacing)
   */
  beginCrossing(sim, car, startArc) {
    this.removeFromQueue(car);
    if (isDedicatedStraightLane(car)) {
      car.reservedZones = [];
    } else {
      this.reserve(sim, car);
    }
    const lane = sim.lanes.find((l) => l.id === car.laneId) || null;
    const path = getPathForCar(car, lane);
    car.pathKey = getWaypointKey(car);
    car.crossingPath = path;
    car.pathArc = buildPathArcTable(path);
    car.pathLength = car.pathArc.total;
    const s =
      startArc != null
        ? Math.max(0, Math.min(car.pathLength, startArc))
        : pathArcLengthAtT(car.pathArc, estimatePathT(path, car.x, car.y));
    car.pathT = pathTAtArcLength(car.pathArc, s);
    car.travelForward = null;
    car.exitHeading = null;
    car.state = 'crossing';
    car.speed = Math.min(car.speed ?? 0, CAR.MAX_SPEED);
    // Position/heading stay as-is; carManager blends onto the path while accelerating.
  }

  /**
   * Follow bezier until t=1, then lock outbound direction (event-based, once).
   * @returns {boolean} true when path finished and exit travel is locked
   */
  advanceCrossing(car, delta) {
    const path = car.crossingPath || getBezierPath(car.pathKey || getWaypointKey(car));

    if (car.pathT >= 1) {
      if (!car.travelForward) this._lockExitTravel(car, path);
      return true;
    }

    car.pathT = Math.min(1, (car.pathT || 0) + delta * CAR.CROSSING_SPEED_T);

    if (
      car.pathArc
      && car.movementType === 'left'
      && pathArcLengthAtT(car.pathArc, car.pathT) >= CAR.LENGTH + CAR.CROSSING_FOLLOW_GAP
    ) {
      this.releaseLeftTurnSlot(car);
    }

    const pt = evalPath(path, car.pathT);
    car.x = pt.x;
    car.y = pt.y;
    car.heading = pathTangentHeading(path, car.pathT);
    car.speed = CAR.MAX_SPEED;

    if (car.pathT >= 1) {
      this._lockExitTravel(car, path);
      return true;
    }
    return false;
  }

  /** Constant outbound velocity along locked travelForward. */
  advanceExiting(car, delta) {
    const f = car.travelForward;
    if (!f) return;
    const step = CAR.MAX_SPEED * delta;
    car.x += f.x * step;
    car.y += f.y * step;
    car.heading = car.exitHeading;
    car.speed = CAR.MAX_SPEED;
  }

  /** Free left-turn slot once path is done so the next same-approach car may enter. */
  releaseLeftTurnSlot(car) {
    const z = `LT_${car.approach}`;
    if (this.zones[z] === car.id) this.zones[z] = null;
    if (car.reservedZones) {
      car.reservedZones = car.reservedZones.filter((id) => id !== z);
    }
  }

  updateOccupancy(_sim, car) {
    if (car.state !== 'crossing' && car.state !== 'exiting') return;
    if (!car.reservedZones || car.reservedZones.length === 0) return;
    if (car.state === 'exiting') {
      if (car.movementType === 'left') this.releaseLeftTurnSlot(car);
      if (isOutsideIntersection(car.x, car.y, CAR.LENGTH)) {
        this.release(car);
      }
    }
  }
}
