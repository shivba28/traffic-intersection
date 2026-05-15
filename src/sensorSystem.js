/**
 * Queue-based demand detection (architecture §12).
 * @param {Array<{ id: string, queue: unknown[] }>} lanes
 * @returns {Record<string, number>}
 */
export function readSensors(lanes) {
  const readings = {};
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    readings[lane.id] = lane.queue.length;
  }
  return readings;
}
