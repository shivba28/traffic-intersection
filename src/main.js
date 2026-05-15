import { LOOP } from './constants.js';
import * as geometry from './geometry.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';

const sim = new Simulation();
const fg = document.getElementById('fg');
const bg = document.getElementById('bg');
const signals = document.getElementById('signals');
if (!fg || !bg || !signals) {
  throw new Error('Missing #fg, #bg, or #signals canvas element');
}

const renderer = new Renderer(fg, bg, signals);
renderer.init(geometry);

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
let paused = false;
export let speedMultiplier = 1;

function tick(now) {
  if (!paused) {
    if (lastTime === null) lastTime = now;
    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    const delta = Math.min(rawDelta, LOOP.MAX_DELTA) * speedMultiplier;
    sim.update(delta);
  }
  renderer.draw(sim);
  requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastTime = null;
});

requestAnimationFrame(tick);
