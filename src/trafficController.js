/**
 * Phase state machine + light state (architecture §5).
 */

import { PHASE } from './constants.js';

export const PHASES = [
  {
    id: 'NS_STRAIGHT',
    min: PHASE.MIN_GREEN_STRAIGHT,
    max: PHASE.MAX_GREEN_STRAIGHT,
    fixed: false,
    green: ['N', 'S'],
    leftGreen: [],
  },
  {
    id: 'NS_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
  {
    id: 'ALL_RED_NS_TO_LEFT',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
  {
    id: 'NS_LEFT',
    min: PHASE.MIN_GREEN_LEFT,
    max: PHASE.MAX_GREEN_LEFT,
    fixed: false,
    green: [],
    leftGreen: ['N', 'S'],
  },
  {
    id: 'ALL_RED_NS_TO_EW',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
  {
    id: 'EW_STRAIGHT',
    min: PHASE.MIN_GREEN_STRAIGHT,
    max: PHASE.MAX_GREEN_STRAIGHT,
    fixed: false,
    green: ['E', 'W'],
    leftGreen: [],
  },
  {
    id: 'EW_YELLOW',
    min: PHASE.YELLOW_DURATION,
    max: PHASE.YELLOW_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
  {
    id: 'ALL_RED_EW_TO_LEFT',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
  {
    id: 'EW_LEFT',
    min: PHASE.MIN_GREEN_LEFT,
    max: PHASE.MAX_GREEN_LEFT,
    fixed: false,
    green: [],
    leftGreen: ['E', 'W'],
  },
  {
    id: 'ALL_RED_EW_TO_NS',
    min: PHASE.ALL_RED_DURATION,
    max: PHASE.ALL_RED_DURATION,
    fixed: true,
    green: [],
    leftGreen: [],
  },
];

const APPROACHES = ['N', 'S', 'E', 'W'];

export class TrafficController {
  constructor() {
    this.phaseIndex = 0;
    this.phaseTimer = 0;
    this.lights = this._computeLights();
  }

  get phase() {
    return PHASES[this.phaseIndex];
  }

  _computeLights() {
    const phase = PHASES[this.phaseIndex];
    const lights = {};
    for (let i = 0; i < APPROACHES.length; i++) {
      const approach = APPROACHES[i];
      lights[approach] = {
        main:
          phase.green.includes(approach) ? 'green'
          : phase.id.includes('YELLOW') ? 'yellow'
          : 'red',
        leftArrow: phase.leftGreen.includes(approach) ? 'green' : 'off',
      };
    }
    return lights;
  }

  _phaseDuration(phase) {
    return phase.min;
  }

  _advancePhase() {
    this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
    this.phaseTimer = 0;
    this.lights = this._computeLights();
  }

  /** @param {number} delta */
  update(delta) {
    const phase = PHASES[this.phaseIndex];
    this.phaseTimer += delta;
    if (this.phaseTimer >= this._phaseDuration(phase)) {
      this._advancePhase();
    }
  }
}
