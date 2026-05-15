/**
 * Traffic signal "brain" — centralized phase state machine + light derivation.
 * Step 5.5: declarative phases, runtime invariants, delta sub-stepping, canMove API.
 */

import {
  PHASE,
  MAIN_SIGNAL,
  LEFT_ARROW,
  SIGNAL_AXIS,
  DEBUG_ADAPTIVE_TIMING,
  DEBUG_PHASE_TRANSITIONS,
} from './constants.js';
import { readSensors } from './sensorSystem.js';

const APPROACHES = ['N', 'S', 'E', 'W'];

/** Max simulation time applied per internal tick (100ms) — avoids phase skips on lag/tab hide. */
const MAX_UPDATE_STEP_SEC = 0.1;

/** Tolerance for phaseElapsedTime >= threshold after repeated float accumulation. */
const PHASE_TIMER_EPSILON = 1e-6;

const MAIN_SIGNAL_VALUES = new Set(Object.values(MAIN_SIGNAL));
const LEFT_ARROW_VALUES = new Set(Object.values(LEFT_ARROW));

/** @typedef {{ main: string, leftArrow: string }} AxisSignals */

/**
 * @typedef {object} PhaseDef
 * @property {string} id
 * @property {number} min
 * @property {number} max
 * @property {boolean} fixed
 * @property {AxisSignals} ns
 * @property {AxisSignals} ew
 */

/** All-red / off defaults for clearance phases. */
const ALL_RED = {
  ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
};

/**
 * Fully declarative phase table — each row is the exact signal state (no ID inference).
 * @type {PhaseDef[]}
 */
export const PHASES = [
  {
    id: 'NS_STRAIGHT',
    min: PHASE.MIN_GREEN_STRAIGHT,
    max: PHASE.MAX_GREEN_STRAIGHT,
    fixed: false,
    ns: { main: MAIN_SIGNAL.GREEN, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'NS_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    ns: { main: MAIN_SIGNAL.YELLOW, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'ALL_RED_NS_TO_LEFT',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    ...ALL_RED,
  },
  {
    id: 'NS_LEFT',
    min: PHASE.MIN_GREEN_LEFT,
    max: PHASE.MAX_GREEN_LEFT,
    fixed: false,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.GREEN },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'NS_LEFT_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.YELLOW },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'ALL_RED_NS_TO_EW',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    ...ALL_RED,
  },
  {
    id: 'EW_STRAIGHT',
    min: PHASE.MIN_GREEN_STRAIGHT,
    max: PHASE.MAX_GREEN_STRAIGHT,
    fixed: false,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.GREEN, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'EW_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.YELLOW, leftArrow: LEFT_ARROW.OFF },
  },
  {
    id: 'ALL_RED_EW_TO_LEFT',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    ...ALL_RED,
  },
  {
    id: 'EW_LEFT',
    min: PHASE.MIN_GREEN_LEFT,
    max: PHASE.MAX_GREEN_LEFT,
    fixed: false,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.GREEN },
  },
  {
    id: 'EW_LEFT_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    ns: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.OFF },
    ew: { main: MAIN_SIGNAL.RED, leftArrow: LEFT_ARROW.YELLOW },
  },
  {
    id: 'ALL_RED_EW_TO_NS',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    ...ALL_RED,
  },
];

/** Sum of active phase durations (uses min — matches _phaseDuration). */
export const TOTAL_CYCLE_TIME = PHASES.reduce((sum, p) => sum + p.min, 0);

const DIRECTION_TO_AXIS = {
  NS: 'ns',
  N: 'ns',
  S: 'ns',
  EW: 'ew',
  E: 'ew',
  W: 'ew',
};

function assert(condition, message) {
  if (!condition) throw new Error(`TrafficController invariant: ${message}`);
}

/** Validate phase table once at module load — fail fast on misconfiguration. */
function validatePhaseDefinitions(phases) {
  assert(phases.length > 0, 'PHASES must not be empty');

  const seenIds = new Set();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    assert(typeof phase.id === 'string' && phase.id.length > 0, `phase[${i}] missing id`);
    assert(!seenIds.has(phase.id), `duplicate phase id "${phase.id}"`);
    seenIds.add(phase.id);

    assert(phase.min > 0, `phase "${phase.id}" min must be > 0`);
    assert(phase.max >= phase.min, `phase "${phase.id}" max must be >= min`);

    for (const axisKey of ['ns', 'ew']) {
      const axis = phase[axisKey];
      assert(axis && typeof axis === 'object', `phase "${phase.id}" missing signals.${axisKey}`);
      assert(
        MAIN_SIGNAL_VALUES.has(axis.main),
        `phase "${phase.id}" ${axisKey}.main is not a valid MAIN_SIGNAL: ${axis.main}`
      );
      assert(
        LEFT_ARROW_VALUES.has(axis.leftArrow),
        `phase "${phase.id}" ${axisKey}.leftArrow is not a valid LEFT_ARROW: ${axis.leftArrow}`
      );
    }

    assert(
      !(phase.ns.main === MAIN_SIGNAL.GREEN && phase.ew.main === MAIN_SIGNAL.GREEN),
      `phase "${phase.id}" cannot have both NS and EW main GREEN`
    );
  }
}

validatePhaseDefinitions(PHASES);

/**
 * Active axis + movement for adaptive green phases (null for yellow / all-red).
 * @param {PhaseDef} phase
 * @returns {{ axis: 'NS' | 'EW', movementType: 'straight' | 'left' } | null}
 */
function adaptiveDemandKey(phase) {
  if (phase.fixed) return null;
  if (phase.ns.main === MAIN_SIGNAL.GREEN && phase.ew.main !== MAIN_SIGNAL.GREEN) {
    return { axis: 'NS', movementType: 'straight' };
  }
  if (phase.ew.main === MAIN_SIGNAL.GREEN && phase.ns.main !== MAIN_SIGNAL.GREEN) {
    return { axis: 'EW', movementType: 'straight' };
  }
  if (phase.ns.leftArrow === LEFT_ARROW.GREEN) {
    return { axis: 'NS', movementType: 'left' };
  }
  if (phase.ew.leftArrow === LEFT_ARROW.GREEN) {
    return { axis: 'EW', movementType: 'left' };
  }
  return null;
}

/** Expand axis-level declarative signals to per-approach light map. */
function lightsFromPhase(phase) {
  const lights = {};
  for (let i = 0; i < SIGNAL_AXIS.NS.length; i++) {
    const approach = SIGNAL_AXIS.NS[i];
    lights[approach] = { main: phase.ns.main, leftArrow: phase.ns.leftArrow };
  }
  for (let i = 0; i < SIGNAL_AXIS.EW.length; i++) {
    const approach = SIGNAL_AXIS.EW[i];
    lights[approach] = { main: phase.ew.main, leftArrow: phase.ew.leftArrow };
  }
  return lights;
}

function axisMainStateFromLights(lights, approaches) {
  let state = MAIN_SIGNAL.RED;
  for (let i = 0; i < approaches.length; i++) {
    const main = lights[approaches[i]].main;
    if (main === MAIN_SIGNAL.GREEN) return MAIN_SIGNAL.GREEN;
    if (main === MAIN_SIGNAL.YELLOW) state = MAIN_SIGNAL.YELLOW;
  }
  return state;
}

function normalizeDirection(direction) {
  if (typeof direction !== 'string' || direction.length === 0) {
    throw new Error(`TrafficController.canMove: invalid direction "${direction}"`);
  }
  const key = direction.toUpperCase();
  if (!(key in DIRECTION_TO_AXIS) && !APPROACHES.includes(key)) {
    throw new Error(`TrafficController.canMove: unknown direction "${direction}"`);
  }
  return key;
}

export class TrafficController {
  constructor() {
    this.phaseIndex = 0;
    this.phaseElapsedTime = 0;
    this.currentPhaseMin = PHASES[0].min;
    this.currentPhaseMax = PHASES[0].max;
    /** @type {Record<string, { main: string, leftArrow: string }>} */
    this.lights = this._computeLights();
    this._assertRuntimeInvariants();
  }

  get phase() {
    return PHASES[this.phaseIndex];
  }

  /** Current index in PHASES (debug / HUD). */
  get currentPhaseIndex() {
    return this.phaseIndex;
  }

  /** Full cycle length in seconds (sum of phase durations). */
  get totalCycleTime() {
    return TOTAL_CYCLE_TIME;
  }

  /** Seconds left in the current phase (for HUD / debug UI). */
  get phaseTimeRemaining() {
    return Math.max(0, this.currentPhaseMax - this.phaseElapsedTime);
  }

  /**
   * Axis-level main signal summary — easy hook for UI overlays.
   * @returns {{ ns: string, ew: string }}
   */
  get axisMainStates() {
    return {
      ns: axisMainStateFromLights(this.lights, SIGNAL_AXIS.NS),
      ew: axisMainStateFromLights(this.lights, SIGNAL_AXIS.EW),
    };
  }

  _computeLights() {
    return lightsFromPhase(PHASES[this.phaseIndex]);
  }

  _initPhaseTiming() {
    const phase = this.phase;
    this.currentPhaseMin = phase.min;
    this.currentPhaseMax = phase.max;
  }

  /** @param {number} [carryOver] elapsed time to apply to the next phase */
  _advancePhase(carryOver = 0) {
    this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
    this.phaseElapsedTime = carryOver;
    this._initPhaseTiming();
    this.lights = this._computeLights();
    this._assertRuntimeInvariants();
    if (DEBUG_PHASE_TRANSITIONS) {
      console.log('Phase:', this.phase.id);
    }
  }

  /**
   * @param {import('./sensorSystem.js').SensorDemand} demand
   * @returns {number}
   */
  _activeDemand(demand) {
    const key = adaptiveDemandKey(this.phase);
    if (!key) return 0;
    return demand[key.axis][key.movementType];
  }

  /**
   * Elapsed time credited to the phase being left (for overflow carry).
   * @param {import('./sensorSystem.js').SensorDemand} demand
   */
  _advanceThreshold(demand) {
    const phase = this.phase;
    if (phase.fixed) return phase.min;

    const activeDemand = this._activeDemand(demand);
    if (this.phaseElapsedTime >= this.currentPhaseMax - PHASE_TIMER_EPSILON) {
      return this.currentPhaseMax;
    }
    if (activeDemand === 0 && this.phaseElapsedTime >= this.currentPhaseMin - PHASE_TIMER_EPSILON) {
      return this.currentPhaseMin;
    }
    return this.currentPhaseMax;
  }

  /**
   * @param {import('./sensorSystem.js').SensorDemand} demand
   */
  _shouldAdvancePhase(demand) {
    const phase = this.phase;
    if (phase.fixed) {
      return this.phaseElapsedTime >= phase.min - PHASE_TIMER_EPSILON;
    }

    const activeDemand = this._activeDemand(demand);
    if (this.phaseElapsedTime < this.currentPhaseMin - PHASE_TIMER_EPSILON) return false;
    if (this.phaseElapsedTime >= this.currentPhaseMax - PHASE_TIMER_EPSILON) return true;
    if (activeDemand === 0) return true;
    return false;
  }

  /**
   * Movement permission API for Step 6 (cars will call this later).
   * @param {string} direction — "NS" | "EW" or per-approach "N" | "S" | "E" | "W"
   * @param {'straight' | 'left'} movementType
   * @param {{ state?: string, movementType?: string } | null} [car] optional — allows in-intersection cars during LEFT_YELLOW
   * @returns {boolean}
   */
  canMove(direction, movementType, car = null) {
    const key = normalizeDirection(direction);

    if (movementType === 'straight') {
      if (key === 'NS') return this.axisMainStates.ns === MAIN_SIGNAL.GREEN;
      if (key === 'EW') return this.axisMainStates.ew === MAIN_SIGNAL.GREEN;
      return this.lights[key].main === MAIN_SIGNAL.GREEN;
    }

    if (movementType === 'left') {
      if (
        car
        && car.movementType === 'left'
        && (car.state === 'crossing' || car.state === 'exiting')
      ) {
        return true;
      }

      const greenArrow = (approach) => this.lights[approach].leftArrow === LEFT_ARROW.GREEN;
      if (key === 'NS') return SIGNAL_AXIS.NS.every(greenArrow);
      if (key === 'EW') return SIGNAL_AXIS.EW.every(greenArrow);
      const arrow = this.lights[key].leftArrow;
      if (arrow === LEFT_ARROW.YELLOW || arrow === LEFT_ARROW.OFF) return false;
      return arrow === LEFT_ARROW.GREEN;
    }

    throw new Error(`TrafficController.canMove: unknown movementType "${movementType}"`);
  }

  /** Runtime checks — throws on violation (never silent). */
  _assertRuntimeInvariants() {
    assert(
      this.phaseIndex >= 0 && this.phaseIndex < PHASES.length,
      `phaseIndex ${this.phaseIndex} out of range [0, ${PHASES.length})`
    );
    assert(
      this.phaseElapsedTime >= 0,
      `phaseElapsedTime must be >= 0, got ${this.phaseElapsedTime}`
    );

    const { ns, ew } = this.axisMainStates;
    assert(
      !(ns === MAIN_SIGNAL.GREEN && ew === MAIN_SIGNAL.GREEN),
      'both NS and EW cannot be main GREEN simultaneously'
    );

    for (let i = 0; i < APPROACHES.length; i++) {
      const approach = APPROACHES[i];
      const lamp = this.lights[approach];
      assert(lamp, `missing lights for approach ${approach}`);
      assert(
        MAIN_SIGNAL_VALUES.has(lamp.main),
        `approach ${approach} main "${lamp.main}" is not a valid MAIN_SIGNAL`
      );
      assert(
        LEFT_ARROW_VALUES.has(lamp.leftArrow),
        `approach ${approach} leftArrow "${lamp.leftArrow}" is not a valid LEFT_ARROW`
      );
    }

    // Derived lights must match the declarative phase row.
    const expected = lightsFromPhase(this.phase);
    for (let i = 0; i < APPROACHES.length; i++) {
      const approach = APPROACHES[i];
      assert(
        this.lights[approach].main === expected[approach].main
          && this.lights[approach].leftArrow === expected[approach].leftArrow,
        `lights[${approach}] does not match phase "${this.phase.id}" definition`
      );
    }
  }

  /**
   * Add elapsed time, then advance when min/max/demand rules allow (carries overflow).
   * @param {import('./simulation.js').Simulation} sim
   * @param {number} delta seconds
   */
  _tickPhaseTimer(sim, delta) {
    this.phaseElapsedTime += delta;
    let demand = readSensors(sim);

    while (this._shouldAdvancePhase(demand)) {
      const threshold = this._advanceThreshold(demand);
      const excess = Math.max(0, this.phaseElapsedTime - threshold);
      this._advancePhase(excess);
      demand = readSensors(sim);
    }

    if (DEBUG_ADAPTIVE_TIMING && adaptiveDemandKey(this.phase)) {
      console.log({
        phase: this.phase.id,
        elapsed: this.phaseElapsedTime,
        demand: this._activeDemand(demand),
      });
    }
  }

  /**
   * Advance the signal cycle. Called once per simulation tick (no internal setInterval).
   * Large deltas are clamped per sub-step so phases are not skipped.
   * @param {import('./simulation.js').Simulation} sim
   * @param {number} delta seconds since last frame
   */
  update(sim, delta) {
    assert(delta >= 0, `delta must be >= 0, got ${delta}`);

    let remaining = delta;
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_UPDATE_STEP_SEC);
      this._tickPhaseTimer(sim, step);
      remaining -= step;
    }

    this._assertRuntimeInvariants();
  }
}
