/**
 * Animated pedestrians on crosswalks — visual only (no traffic logic).
 * Figure style ported from Traffic Intersection.html drawPedestrian().
 */

import { getIntersectionInnerRect } from '../geometry.js';
import { PED_STATE } from '../trafficController.js';

const APPROACHES = ['N', 'S', 'E', 'W'];
const BLINK_HALF_PERIOD = 0.5;
const WAIT_OFF = 15;
const WAIT_HALF = 12;
const WAIT_PAD_FILL = 'rgba(255, 254, 250, 0.92)';
const WAIT_PAD_EDGE = 'rgba(20, 22, 26, 0.18)';
const WAIT_PAD_DOT = '#54565B';
const WAIT_PAD_RING = '#8B8C90';

/** Corner pad centers: NW, NE, SW, SE — must match `drawWaitingPads`. */
function getWaitPadCornerCenters(box) {
  return [
    { x: box.x0 - WAIT_OFF, y: box.y0 - WAIT_OFF },
    { x: box.x1 + WAIT_OFF, y: box.y0 - WAIT_OFF },
    { x: box.x0 - WAIT_OFF, y: box.y1 + WAIT_OFF },
    { x: box.x1 + WAIT_OFF, y: box.y1 + WAIT_OFF },
  ];
}

function waitPadRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Pedestrian wait pads — design from Traffic Intersection.html `drawWaitBoxes`.
 * One rounded square at each intersection corner, offset from inner rect by `WAIT_OFF`.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawWaitingPads(ctx) {
  const box = getIntersectionInnerRect();
  const corners = getWaitPadCornerCenters(box);

  ctx.save();
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    waitPadRoundRect(
      ctx,
      c.x - WAIT_HALF + 1,
      c.y - WAIT_HALF + 1.6,
      WAIT_HALF * 2,
      WAIT_HALF * 2,
      3.5
    );
    ctx.fill();

    ctx.fillStyle = WAIT_PAD_FILL;
    waitPadRoundRect(
      ctx,
      c.x - WAIT_HALF,
      c.y - WAIT_HALF,
      WAIT_HALF * 2,
      WAIT_HALF * 2,
      3.5
    );
    ctx.fill();

    ctx.strokeStyle = WAIT_PAD_EDGE;
    ctx.lineWidth = 0.8;
    waitPadRoundRect(
      ctx,
      c.x - WAIT_HALF + 0.5,
      c.y - WAIT_HALF + 0.5,
      WAIT_HALF * 2 - 1,
      WAIT_HALF * 2 - 1,
      3
    );
    ctx.stroke();

    ctx.strokeStyle = WAIT_PAD_RING;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = WAIT_PAD_DOT;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Shirt accent per approach (warm palette from reference mock). */
const SHIRT_BY_APPROACH = {
  N: '#5A7DA0',
  S: '#D49150',
  E: '#6B8E7E',
  W: '#B85C3D',
};

/**
 * Pedestrian path along wait-pad centers (near corner → far corner), same near/far as former stripe segment.
 * @param {'N'|'S'|'E'|'W'} approach
 * @returns {{ near: { x: number, y: number }, far: { x: number, y: number } }}
 */
function getApproachPadSegment(approach) {
  const p = getWaitPadCornerCenters(getIntersectionInnerRect());
  switch (approach) {
    case 'N':
      return { near: p[0], far: p[1] };
    case 'S':
      return { near: p[3], far: p[2] };
    case 'E':
      return { near: p[1], far: p[3] };
    case 'W':
      return { near: p[2], far: p[0] };
    default:
      throw new Error(`Unknown approach "${approach}"`);
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function positionOnSegment(seg, progress) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: lerp(seg.near.x, seg.far.x, t),
    y: lerp(seg.near.y, seg.far.y, t),
  };
}

/**
 * Stick-figure pedestrian (reference HTML drawPedestrian).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {'N'|'S'|'E'|'W'} approach
 * @param {boolean} walking
 * @param {number} bob
 * @param {number} alpha
 */
function drawPedFigure(ctx, x, y, approach, walking, bob, alpha) {
  const alongX = approach === 'N' || approach === 'S';
  const bobY = walking ? Math.sin(bob) * 0.6 : 0;
  const swing = walking ? Math.sin(bob) * 2.4 : 0;
  const shirt = SHIRT_BY_APPROACH[approach] || '#D49150';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (!alongX) ctx.rotate(Math.PI / 2);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(1.5, bobY + 2.5, 4.2, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, bobY);
  ctx.strokeStyle = '#1F2126';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3.4, swing);
  ctx.lineTo(3.4, -swing);
  ctx.stroke();

  ctx.fillStyle = '#1F2126';
  ctx.beginPath();
  ctx.arc(0, 0, 3.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export class PedestrianRenderer {
  constructor() {
    /** @type {Map<'N'|'S'|'E'|'W', { progress: number, bob: number }>} */
    this._walkers = new Map();
    this._lastPedState = PED_STATE.IDLE;
    this._blinkClock = 0;
  }

  reset() {
    this._walkers.clear();
    this._lastPedState = PED_STATE.IDLE;
    this._blinkClock = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {import('../trafficController.js').TrafficController} tc
   */
  update(dt, tc) {
    const state = tc.pedState;

    if (this._lastPedState === PED_STATE.IDLE && state === PED_STATE.WALK) {
      for (let i = 0; i < APPROACHES.length; i++) {
        const approach = APPROACHES[i];
        if (tc.pedRequests[approach]) {
          this._walkers.set(approach, { progress: 0, bob: 0 });
        }
      }
    }

    const walking = state === PED_STATE.WALK;

    if (walking && this._walkers.size > 0) {
      const duration = tc.pedPhaseElapsed + tc.phaseTimeRemaining;
      const progress = duration > 0 ? Math.min(1, tc.pedPhaseElapsed / duration) : 1;
      for (const anim of this._walkers.values()) {
        anim.progress = progress;
        anim.bob = (anim.bob + dt * 7) % (Math.PI * 2);
      }
    }

    if (state === PED_STATE.FLASHING_DONT_WALK) {
      this._blinkClock += dt;
    } else if (state === PED_STATE.IDLE) {
      this._blinkClock = 0;
    }

    if (state === PED_STATE.IDLE) {
      this._walkers.clear();
    }

    this._lastPedState = state;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../trafficController.js').TrafficController} tc
   */
  draw(ctx, tc) {
    if (this._walkers.size === 0) return;

    const walking = tc.pedState === PED_STATE.WALK;
    const flashing = tc.pedState === PED_STATE.FLASHING_DONT_WALK;
    const blinkOn = !flashing || Math.floor(this._blinkClock / BLINK_HALF_PERIOD) % 2 === 0;
    const alpha = blinkOn ? 1 : 0.25;

    for (const [approach, anim] of this._walkers) {
      const seg = getApproachPadSegment(approach);
      const { x, y } = positionOnSegment(seg, anim.progress);
      drawPedFigure(ctx, x, y, approach, walking, anim.bob, alpha);
    }
  }
}
