/**
 * Queue-based demand detection (architecture §12).
 */

import { SIGNAL_AXIS } from './constants.js';

/** @typedef {{ straight: number, left: number }} AxisDemand */
/** @typedef {{ NS: AxisDemand, EW: AxisDemand }} SensorDemand */

/**
 * Sum queue lengths per axis and movement type (straight vs left lanes).
 * @param {import('./simulation.js').Simulation} sim
 * @returns {SensorDemand}
 */
export function readSensors(sim) {
  const demand = {
    NS: { straight: 0, left: 0 },
    EW: { straight: 0, left: 0 },
  };

  for (let i = 0; i < sim.lanes.length; i++) {
    const lane = sim.lanes[i];
    const count = lane.queue.length;
    if (count === 0) continue;

    const axis = SIGNAL_AXIS.NS.includes(lane.approach) ? 'NS' : 'EW';
    const movementType = lane.type === 'left' ? 'left' : 'straight';
    demand[axis][movementType] += count;
  }

  return demand;
}
