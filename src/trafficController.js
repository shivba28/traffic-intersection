/**
 * Traffic signal "brain" — centralized phase state machine + light derivation.
 * Step 5.5: declarative phases, runtime invariants, delta sub-stepping, canMove API.
 */

import { PHASE, MAIN_SIGNAL, LEFT_ARROW, SIGNAL_AXIS } from './constants.js';

const APPROACHES = ['N', 'S', 'E', 'W'];

/** Max simulation time applied per internal tick (100ms) — avoids phase skips on lag/tab hide. */
const MAX_UPDATE_STEP_SEC = 0.1;

/** Tolerance for phaseTimer >= duration after repeated float accumulation. */
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
    this.phaseTimer = 0;
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
    return Math.max(0, this._phaseDuration(this.phase) - this.phaseTimer);
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

  _phaseDuration(phase) {
    return phase.min;
  }

  _advancePhase() {
    this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
    this.phaseTimer = 0;
    this.lights = this._computeLights();
    this._assertRuntimeInvariants();
  }

  /**
   * Movement permission API for Step 6 (cars will call this later).
   * @param {string} direction — "NS" | "EW" or per-approach "N" | "S" | "E" | "W"
   * @param {'straight' | 'left'} movementType
   * @returns {boolean}
   */
  canMove(direction, movementType) {
    const key = normalizeDirection(direction);

    if (movementType === 'straight') {
      if (key === 'NS') return this.axisMainStates.ns === MAIN_SIGNAL.GREEN;
      if (key === 'EW') return this.axisMainStates.ew === MAIN_SIGNAL.GREEN;
      return this.lights[key].main === MAIN_SIGNAL.GREEN;
    }

    if (movementType === 'left') {
      if (key === 'NS') {
        return SIGNAL_AXIS.NS.every((a) => this.lights[a].leftArrow === LEFT_ARROW.GREEN);
      }
      if (key === 'EW') {
        return SIGNAL_AXIS.EW.every((a) => this.lights[a].leftArrow === LEFT_ARROW.GREEN);
      }
      return this.lights[key].leftArrow === LEFT_ARROW.GREEN;
    }

    throw new Error(`TrafficController.canMove: unknown movementType "${movementType}"`);
  }

  /** Runtime checks — throws on violation (never silent). */
  _assertRuntimeInvariants() {
    assert(
      this.phaseIndex >= 0 && this.phaseIndex < PHASES.length,
      `phaseIndex ${this.phaseIndex} out of range [0, ${PHASES.length})`
    );
    assert(this.phaseTimer >= 0, `phaseTimer must be >= 0, got ${this.phaseTimer}`);

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
   * Add elapsed time, then drain full phase durations (carries overflow across phases).
   * @param {number} delta seconds
   */
  _tickPhaseTimer(delta) {
    this.phaseTimer += delta;
    let duration = this._phaseDuration(PHASES[this.phaseIndex]);
    while (this.phaseTimer >= duration - PHASE_TIMER_EPSILON) {
      this.phaseTimer -= duration;
      this._advancePhase();
      duration = this._phaseDuration(PHASES[this.phaseIndex]);
    }
  }

  /**
   * Advance the signal cycle. Called once per simulation tick (no internal setInterval).
   * Large deltas are clamped per sub-step so phases are not skipped.
   * @param {number} delta seconds since last frame
   */
  update(delta) {
    assert(delta >= 0, `delta must be >= 0, got ${delta}`);

    let remaining = delta;
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_UPDATE_STEP_SEC);
      this._tickPhaseTimer(step);
      remaining -= step;
    }

    this._assertRuntimeInvariants();
  }
}
