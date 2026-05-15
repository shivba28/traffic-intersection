/**
 * Runtime presentation tweaks — theme, density, diagnostics, crosswalks.
 * Palette UI is omitted; no simulation rule changes beyond spawn interval.
 */

import { SPAWN } from './constants.js';
import { DEBUG_INTERSECTION } from './intersectionController.js';

/** @typedef {'light' | 'dark'} Theme */
/** @typedef {'low' | 'med' | 'high'} Density */
/** @typedef {'on' | 'off'} Toggle */

export const TWEAK_DEFAULTS = {
  theme: 'light',
  density: 'med',
  diag: 'off',
  crosswalks: 'on',
};

/** @type {typeof TWEAK_DEFAULTS} */
export const tweaks = { ...TWEAK_DEFAULTS };

/** Seconds between spawn attempts (matches design reference means). */
const DENSITY_INTERVAL = {
  low: 2.8,
  med: 1.4,
  high: 0.7,
};

export function getSpawnInterval() {
  return DENSITY_INTERVAL[tweaks.density] ?? SPAWN.INTERVAL;
}

export function showCrosswalks() {
  return tweaks.crosswalks === 'on';
}

/** Canvas / scene colors per theme (presentation only). */
const THEME_SCENE = {
  light: {
    background: '#f4f2ec',
    asphalt: '#2b2d31',
  },
  dark: {
    background: '#11131a',
    asphalt: '#1a1c20',
  },
};

export function getSceneColors() {
  return THEME_SCENE[tweaks.theme] ?? THEME_SCENE.light;
}

/**
 * @param {import('./renderer.js').Renderer | null | undefined} renderer
 */
function applyTheme(renderer) {
  document.body.classList.toggle('dark', tweaks.theme === 'dark');
  renderer?.redrawStatic();
}

function applyDiagnostics() {
  const on = tweaks.diag === 'on';
  DEBUG_INTERSECTION.showIntersectionZones = on;
  DEBUG_INTERSECTION.showReservedCars = on;
}

/**
 * @param {import('./renderer.js').Renderer} renderer
 */
function redrawStatic(renderer) {
  renderer.redrawStatic();
}

/**
 * @param {string} key
 * @param {string} val
 * @param {import('./renderer.js').Renderer} renderer
 */
/** @param {keyof typeof TWEAK_DEFAULTS} key */
function applyTweak(key, val, renderer) {
  if (key in TWEAK_DEFAULTS) {
    tweaks[key] = val;
  }
  if (key === 'theme') applyTheme(renderer);
  if (key === 'diag') applyDiagnostics();
  if (key === 'crosswalks') redrawStatic(renderer);
}

/**
 * @param {HTMLElement | null} tweaksEl
 */
function syncTweaksUI(tweaksEl) {
  if (!tweaksEl) return;
  const segs = tweaksEl.querySelectorAll('.seg');
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const key = seg.dataset.tweak;
    if (!key || !(key in tweaks)) continue;
    const buttons = seg.querySelectorAll('button');
    for (let j = 0; j < buttons.length; j++) {
      const btn = buttons[j];
      btn.classList.toggle('active', btn.dataset.val === tweaks[key]);
    }
  }
}

function syncTweaksChrome(tweaksEl, expanded) {
  const expandBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('tw-expand'));
  const closeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('tw-close'));
  if (!tweaksEl) return;

  tweaksEl.classList.toggle('is-open', expanded);
  tweaksEl.classList.toggle('tweaks--minimized', !expanded);

  if (expandBtn) {
    expandBtn.hidden = expanded;
    expandBtn.textContent = '▲';
    expandBtn.setAttribute('aria-hidden', expanded ? 'true' : 'false');
    expandBtn.title = 'Expand tweaks';
  }
  if (closeBtn) {
    closeBtn.hidden = !expanded;
    closeBtn.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  }
}

/**
 * @param {import('./renderer.js').Renderer} renderer
 */
export function initTweaks(renderer) {
  const tweaksEl = document.getElementById('tweaks');
  const hdrEl = document.getElementById('hdr');

  applyTheme(renderer);
  applyDiagnostics();

  function setExpanded(expanded) {
    syncTweaksChrome(tweaksEl, expanded);
  }

  tweaksEl?.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.seg button') : null;
    if (btn && btn instanceof HTMLButtonElement) {
      const seg = btn.closest('.seg');
      const key = seg?.dataset.tweak;
      if (key && key in TWEAK_DEFAULTS) {
        applyTweak(/** @type {keyof typeof TWEAK_DEFAULTS} */ (key), btn.dataset.val ?? '', renderer);
        syncTweaksUI(tweaksEl);
      }
      return;
    }
    if (e.target instanceof Element && e.target.closest('#tw-close')) {
      setExpanded(false);
      return;
    }
    if (e.target instanceof Element && e.target.closest('#tw-expand')) {
      setExpanded(true);
      return;
    }
  });

  tweaksEl?.querySelector('.tweaks-head')?.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.closex')) return;
    if (tweaksEl.classList.contains('tweaks--minimized')) setExpanded(true);
  });

  hdrEl?.addEventListener('click', () => {
    if (tweaksEl?.classList.contains('tweaks--minimized')) setExpanded(true);
  });

  syncTweaksUI(tweaksEl);
  setExpanded(true);

  return {
    /** @deprecated use class tweaks--minimized / is-open on #tweaks */
    showTweaks(expanded) {
      setExpanded(expanded);
    },
    tweaks,
  };
}
