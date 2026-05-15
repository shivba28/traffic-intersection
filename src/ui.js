/**
 * HTML overlay — reads simulation state, drives transport controls only.
 */

import { LOOP, MAIN_SIGNAL, LEFT_ARROW } from './constants.js';
import { PHASES } from './trafficController.js';
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
