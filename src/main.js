import { LOOP } from './constants.js';
import * as geometry from './geometry.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { initUI } from './ui.js';
import { initTweaks } from './tweaks.js';

import { initDraggablePanel } from './draggablePanel.js';

const CROSSWALK_DOCK_GAP_PX = 12;

/** Place #crosswalk-panel to the right of #tweaks, bottom-aligned. */
function dockCrosswalkNextToTweaks(panel, tweaksEl, gapPx = CROSSWALK_DOCK_GAP_PX) {
  const tr = tweaksEl.getBoundingClientRect();
  const h = panel.offsetHeight || panel.getBoundingClientRect().height;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${Math.round(tr.right + gapPx)}px`;
  panel.style.top = `${Math.round(tr.bottom - h)}px`;
}

/**
 * Re-docks while tweaks size changes until `unsubscribe()`.
 * @returns {() => void}
 */
function subscribeCrosswalkDock(panel, tweaksEl) {
  const gapPx = CROSSWALK_DOCK_GAP_PX;
  /** @type {number | null} */
  let rafId = null;

  function scheduleDock() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      dockCrosswalkNextToTweaks(panel, tweaksEl, gapPx);
    });
  }

  dockCrosswalkNextToTweaks(panel, tweaksEl, gapPx);
  scheduleDock();

  const ro = new ResizeObserver(scheduleDock);
  ro.observe(tweaksEl);

  window.addEventListener('resize', scheduleDock);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    ro.disconnect();
    window.removeEventListener('resize', scheduleDock);
  };
}

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

const renderer = new Renderer(fg, bg, signals);
renderer.init(geometry);

initTweaks(renderer);

const container = document.getElementById('canvas-container');
if (container) {
  renderer.attachViewportControls(container);
  const crossPanel = document.getElementById('crosswalk-panel');
  const dragHandle = document.getElementById('crosswalk-drag-handle');
  const tweaksEl = document.getElementById('tweaks');
  if (crossPanel && dragHandle) {
    let stopDockCrosswalk =
      tweaksEl != null ? subscribeCrosswalkDock(crossPanel, tweaksEl) : undefined;
    initDraggablePanel(crossPanel, dragHandle, container, {
      onUserCommittedDrag() {
        stopDockCrosswalk?.();
        stopDockCrosswalk = undefined;
      },
    });
  }
}

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
    renderer.pedestrianRenderer.reset();
    lastTime = null;
  },
  onStep: () => {
    sim.update(LOOP.MAX_DELTA * ui.speedMultiplier);
  },
});

function tick(now) {
  let frameDt = 0;
  if (!ui.paused) {
    if (lastTime === null) lastTime = now;
    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    frameDt = Math.min(rawDelta, LOOP.MAX_DELTA) * ui.speedMultiplier;
    sim.update(frameDt);
  }
  ui.update(sim);
  renderer.draw(sim, frameDt);
  requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastTime = null;
});

requestAnimationFrame(tick);
