import { createLanes } from './geometry.js';
import { updateCars } from './carManager.js';
import { TrafficController } from './trafficController.js';
import { seededRng } from './utils.js';

const DEFAULT_SEED = 1;

export class Simulation {
  constructor(seed = DEFAULT_SEED) {
    this.seed = seed;
    this.rng = seededRng(seed);
    this.lanes = createLanes();
    this.cars = [];
    this.crossingCars = [];
    this.trafficController = new TrafficController();
    this.spawnTimer = 0;
    this.spawnApproachIndex = 0;
    this.nextCarId = 1;
    this.stats = {
      throughput: 0,
      totalWaitTime: 0,
    };
  }

  get lights() {
    return this.trafficController.lights;
  }

  /** Active cars for rendering (Step 3: flat list; queues added later). */
  get allCars() {
    return this.cars;
  }

  /** @param {number} delta */
  update(delta) {
    this.trafficController.update(delta);
    updateCars(this, delta);
  }

  reset() {
    this.rng = seededRng(this.seed);
    this.lanes = createLanes();
    this.cars.length = 0;
    this.crossingCars.length = 0;
    this.trafficController = new TrafficController();
    this.spawnTimer = 0;
    this.spawnApproachIndex = 0;
    this.nextCarId = 1;
    this.stats.throughput = 0;
    this.stats.totalWaitTime = 0;
  }
}
