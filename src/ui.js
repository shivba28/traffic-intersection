/**
 * HTML overlay — reads simulation state, drives transport controls only.
 */

import { LOOP, MAIN_SIGNAL, LEFT_ARROW } from './constants.js';
import { PHASES, PED_STATE } from './trafficController.js';
import { readSensors } from './sensorSystem.js';

const PLAY_PATH =
  '<path d="M6 4l14 8-14 8V4z"/>';
const PAUSE_PATH =
  '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

const SPEED_KEYS = {
  '1': 0.5,
  '2': 1,
  '3': 2,
  '4': 4,
};

/** Compass side of the crosswalk (`data-ped-approach`) → direction pedestrians walk toward along that stripe. */
const PED_WALK_TOWARD = {
  N: 'East',
  S: 'West',
  E: 'South',
  W: 'North',
};

/** Side label for tooltips / aria (which leg of the intersection). */
const PED_CROSSWALK_LEG = {
  N: 'north',
  S: 'south',
  E: 'east',
  W: 'west',
};

const PED_BTN_STATE_CLASSES = [
  'ped-btn--default',
  'ped-btn--requested',
  'ped-btn--active',
  'ped-btn--flashing',
  'ped-btn--disabled',
];

/**
 * Crosswalk signal pill in panel header (matches vehicle phase pills).
 * @param {import('./trafficController.js').TrafficController} tc
 * @param {HTMLElement | null} pedPhaseEl
 * @param {HTMLElement | null} pedDotEl
 */
function syncPedPhaseIndicator(tc, pedPhaseEl, pedDotEl) {
  if (!pedPhaseEl) return;

  if (tc.pedState === PED_STATE.IDLE || tc.pedState === PED_STATE.END) {
    pedPhaseEl.textContent = 'Ready';
    if (pedDotEl) pedDotEl.className = 'phase-dot';
    return;
  }
  if (tc.pedState === PED_STATE.WALK) {
    pedPhaseEl.textContent = 'WALK';
    if (pedDotEl) pedDotEl.className = 'phase-dot green';
    return;
  }
  if (tc.pedState === PED_STATE.FLASHING_DONT_WALK) {
    pedPhaseEl.textContent = "Don't walk";
    if (pedDotEl) pedDotEl.className = 'phase-dot amber';
    return;
  }
  pedPhaseEl.textContent = tc.pedState;
  if (pedDotEl) pedDotEl.className = 'phase-dot';
}

/**
 * Derive per-button UI from trafficController ground truth.
 * @param {import('./trafficController.js').TrafficController} tc
 * @param {HTMLButtonElement[]} pedButtons
 */
function syncPedButtons(tc, pedButtons) {
  const cycleActive =
    tc.pedState === PED_STATE.WALK || tc.pedState === PED_STATE.FLASHING_DONT_WALK;

  for (let i = 0; i < pedButtons.length; i++) {
    const btn = pedButtons[i];
    const approach = btn.dataset.pedApproach;
    if (!approach) continue;

    const walkToward = PED_WALK_TOWARD[approach] ?? approach;
    const leg = PED_CROSSWALK_LEG[approach] ?? '';

    const dirEl = btn.querySelector('.ped-btn__dir');
    if (dirEl) dirEl.textContent = walkToward;

    const requested = Boolean(tc.pedRequests[approach]);
    const cell = btn.closest('.ped-btn-cell');
    const statusEl = cell?.querySelector('.ped-btn__status');

    let stateClass = 'ped-btn--default';
    let disabled = false;
    let statusText = '';
    let title = `Request crossing walking toward ${walkToward} (${leg} crosswalk)`;

    if (cycleActive && requested && tc.pedState === PED_STATE.WALK) {
      stateClass = 'ped-btn--active';
      disabled = true;
      statusText = 'WALK';
      title = `${walkToward}bound crossing — walk`;
    } else if (cycleActive && requested && tc.pedState === PED_STATE.FLASHING_DONT_WALK) {
      stateClass = 'ped-btn--flashing';
      disabled = true;
      statusText = "Don't walk";
      title = `${walkToward}bound crossing — flashing don't walk`;
    } else if (cycleActive) {
      stateClass = 'ped-btn--disabled';
      disabled = true;
      title = 'Pedestrian cycle in progress';
    } else if (requested) {
      stateClass = 'ped-btn--requested';
      disabled = true;
      statusText = 'Waiting…';
      title = `Walking toward ${walkToward} requested — waiting for all-red`;
    }

    btn.classList.remove(...PED_BTN_STATE_CLASSES);
    btn.classList.add('ped-btn', stateClass);
    btn.disabled = disabled;
    btn.title = title;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      disabled ? title : `Request crossing walking toward ${walkToward}, ${leg} leg`
    );

    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.hidden = statusText.length === 0;
    }
  }
}

/** @param {import('./trafficController.js').PhaseDef} phase */
function formatPhaseLabel(phase) {
  const id = phase.id;
  if (id.startsWith('ALL_RED')) return 'All Red';
  if (id.endsWith('_YELLOW')) {
    const axis = id.startsWith('NS') ? 'NS' : 'EW';
    return id.includes('LEFT') ? `${axis} · Left Clear` : `${axis} · Clearing`;
  }
  if (id.endsWith('_LEFT')) {
    return `${id.startsWith('NS') ? 'NS' : 'EW'} · Left`;
  }
  if (id.endsWith('_STRAIGHT')) {
    return `${id.startsWith('NS') ? 'NS' : 'EW'} · Through`;
  }
  return id.replace(/_/g, ' ');
}

/** @param {import('./trafficController.js').PhaseDef} phase */
function phaseDotClass(phase) {
  if (phase.id.startsWith('ALL_RED')) return 'red';
  if (
    phase.id.includes('YELLOW')
    || phase.ns.leftArrow === LEFT_ARROW.YELLOW
    || phase.ew.leftArrow === LEFT_ARROW.YELLOW
    || phase.ns.main === MAIN_SIGNAL.YELLOW
    || phase.ew.main === MAIN_SIGNAL.YELLOW
  ) {
    return 'amber';
  }
  return 'green';
}

/** @param {import('./trafficController.js').PhaseDef} phase */
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

/**
 * @param {import('./trafficController.js').PhaseDef} phase
 * @param {import('./sensorSystem.js').SensorDemand} demand
 * @param {number} startsInSec
 */
function formatUpcomingTiming(phase, demand, startsInSec) {
  const starts = `in ${startsInSec.toFixed(1)}s`;
  if (phase.fixed) {
    return `${phase.min.toFixed(1)}s fixed · ${starts}`;
  }
  const key = adaptiveDemandKey(phase);
  const q = key ? demand[key.axis][key.movementType] : 0;
  return `${phase.min.toFixed(1)}–${phase.max.toFixed(1)}s · Q${q} · ${starts}`;
}

/** @param {import('./simulation.js').Simulation} sim */
function countQueued(sim) {
  const demand = readSensors(sim);
  const fromLanes = demand.NS.straight + demand.NS.left + demand.EW.straight + demand.EW.left;
  if (fromLanes > 0) return fromLanes;

  let n = 0;
  for (let i = 0; i < sim.cars.length; i++) {
    const state = sim.cars[i].state;
    if (state === 'moving' || state === 'stopped') n++;
  }
  return n;
}

/**
 * @param {object} opts
 * @param {() => import('./simulation.js').Simulation} opts.getSim
 * @param {() => void} opts.onReset
 * @param {() => void} [opts.onStep]
 */
export function initUI({ getSim, onReset, onStep }) {
  const els = {
    currName: document.getElementById('curr-name'),
    currDot: document.getElementById('curr-dot'),
    currTime: document.getElementById('curr-time'),
    pedPhase: document.getElementById('ped-phase'),
    pedDot: document.getElementById('ped-dot'),
    nextName: document.getElementById('next-name'),
    nextDot: document.getElementById('next-dot'),
    nextTiming: document.getElementById('next-timing'),
    nextTimingLabel: document.getElementById('next-timing-label'),
    tput: document.getElementById('tput'),
    twait: document.getElementById('twait'),
    tqueue: document.getElementById('tqueue'),
    playBtn: document.getElementById('playBtn'),
    playIco: document.getElementById('playIco'),
    stepBtn: document.getElementById('stepBtn'),
    resetBtn: document.getElementById('resetBtn'),
    spdGroup: document.getElementById('spdGroup'),
  };

  let paused = false;
  let speedMultiplier = 1;

  function setPlaying(playing) {
    paused = !playing;
    if (els.playIco) {
      els.playIco.innerHTML = playing ? PAUSE_PATH : PLAY_PATH;
    }
    if (els.playBtn) {
      els.playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      els.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
  }

  function setSpeed(mult) {
    speedMultiplier = mult;
    if (!els.spdGroup) return;
    const buttons = els.spdGroup.querySelectorAll('.speed-btn');
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const active = parseFloat(btn.dataset.spd) === mult;
      btn.classList.toggle('active', active);
    }
  }

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  /** @param {import('./simulation.js').Simulation} sim */
  function update(sim) {
    const tc = sim.trafficController;
    const demand = readSensors(sim);
    const phase = tc.phase;
    const nextPhase = PHASES[(tc.currentPhaseIndex + 1) % PHASES.length];
    const startsIn = tc.phaseTimeRemaining;

    if (els.currName) els.currName.textContent = formatPhaseLabel(phase);
    if (els.currDot) els.currDot.className = `phase-dot ${phaseDotClass(phase)}`;
    if (els.currTime) {
      els.currTime.textContent = `${tc.phaseElapsedTime.toFixed(1).padStart(4, '0')}s`;
    }

    syncPedPhaseIndicator(tc, els.pedPhase, els.pedDot);
    syncPedButtons(tc, pedButtons);

    if (els.nextName) els.nextName.textContent = formatPhaseLabel(nextPhase);
    if (els.nextDot) els.nextDot.className = `phase-dot ${phaseDotClass(nextPhase)}`;
    if (els.nextTimingLabel) {
      els.nextTimingLabel.textContent = nextPhase.fixed ? 'Duration' : 'Adaptive timing';
    }
    if (els.nextTiming) {
      els.nextTiming.textContent = formatUpcomingTiming(nextPhase, demand, startsIn);
    }

    const throughput = sim.stats.throughput;
    if (els.tput) els.tput.textContent = String(throughput);
    if (els.twait) {
      const avg = throughput > 0 ? sim.stats.totalWaitTime / throughput : 0;
      els.twait.textContent = avg.toFixed(1);
    }
    if (els.tqueue) els.tqueue.textContent = String(countQueued(sim));
  }

  function reset() {
    onReset();
    update(getSim());
  }

  function step() {
    setPlaying(false);
    onStep?.();
    update(getSim());
  }

  setPlaying(true);
  setSpeed(1);

  const pedButtons = Array.from(document.querySelectorAll('[data-ped-approach]')).filter(
    (el) => el instanceof HTMLButtonElement
  );

  const pedActions = document.querySelector('.ped-compass');
  pedActions?.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-ped-approach]') : null;
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
    const approach = btn.dataset.pedApproach;
    if (!approach) return;
    const tc = getSim().trafficController;
    if (!tc.requestPedestrian(approach)) return;
    syncPedPhaseIndicator(tc, els.pedPhase, els.pedDot);
    syncPedButtons(tc, pedButtons);
  });

  const tc0 = getSim().trafficController;
  syncPedPhaseIndicator(tc0, els.pedPhase, els.pedDot);
  syncPedButtons(tc0, pedButtons);

  els.playBtn?.addEventListener('click', () => setPlaying(paused));
  els.stepBtn?.addEventListener('click', step);
  els.resetBtn?.addEventListener('click', reset);

  els.spdGroup?.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.speed-btn') : null;
    if (!btn || !(btn instanceof HTMLButtonElement)) return;
    const spd = parseFloat(btn.dataset.spd);
    if (Number.isFinite(spd)) setSpeed(spd);
  });

  window.addEventListener('keydown', (e) => {
    if (isEditableTarget(e.target)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(paused);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      reset();
      return;
    }
    if (e.key in SPEED_KEYS) {
      setSpeed(SPEED_KEYS[e.key]);
    }
  });

  return {
    get paused() {
      return paused;
    },
    get speedMultiplier() {
      return speedMultiplier;
    },
    setPlaying,
    setSpeed,
    update,
    reset,
    step,
  };
}
