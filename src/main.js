import { LOOP } from './constants.js';
import * as geometry from './geometry.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { initUI } from './ui.js';
import { initTweaks } from './tweaks.js';

function parseSeedFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw == null || raw === '') return undefined;
  const seed = Number.parseInt(raw, 10);
  return Number.isFinite(seed) ? seed : undefined;
}

const seed = parseSeedFromUrl();
const sim = seed !== undefined ? new Simulation(seed) : new Simulation();

const fg = document.getElementById('fg');
const bg = document.getElementById('bg');
const signals = document.getElementById('signals');
if (!fg || !bg || !signals) {
  throw new Error('Missing #fg, #bg, or #signals canvas element');
}

const container = document.getElementById('canvas-container');
const renderer = new Renderer(fg, bg, signals);
renderer.init(geometry);
if (container) {
  renderer.attachViewportControls(container);
}
initTweaks(renderer);

let resizeScheduled = false;
window.addEventListener('resize', () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    renderer.resize();
  });
});

let lastTime = null;

const ui = initUI({
  getSim: () => sim,
  onReset: () => {
    sim.reset();
    lastTime = null;
  },
  onStep: () => {
    sim.update(LOOP.MAX_DELTA * ui.speedMultiplier);
  },
});

function tick(now) {
  if (!ui.paused) {
    if (lastTime === null) lastTime = now;
    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    const delta = Math.min(rawDelta, LOOP.MAX_DELTA) * ui.speedMultiplier;
    sim.update(delta);
  }
  ui.update(sim);
  renderer.draw(sim);
  requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastTime = null;
});

requestAnimationFrame(tick);
