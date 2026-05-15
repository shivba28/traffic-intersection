import { WORLD, CAR, COLORS, MARKING, SIGNAL } from './constants.js';
import { DEBUG_INTERSECTION } from './intersectionController.js';

/** CSS display size from viewport (square world → equal width and height). */
function computeDisplaySize() {
  const width = document.documentElement.clientWidth;
  return { width, height: width };
}

/**
 * DPR-aware canvas: backing store matches CSS pixels × dpr; context maps WORLD.SIZE logical units.
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @returns {CanvasRenderingContext2D}
 */
function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const backingW = Math.max(1, Math.round(cssWidth * dpr));
  const backingH = Math.max(1, Math.round(cssHeight * dpr));
  canvas.width = backingW;
  canvas.height = backingH;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = dpr * (cssWidth / WORLD.SIZE);
  ctx.scale(scale, scale);
  return ctx;
}

function redrawStaticBackground(ctx, geometryModule) {
  ctx.save();
  ctx.translate(0.5, 0.5);
  drawStaticIntersection(ctx, geometryModule);
  ctx.restore();
}

function strokeDashedLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.setLineDash([MARKING.DASH_LENGTH, MARKING.DASH_GAP]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Left-turn arrow path (local +x = along approach toward intersection).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} shaft
 * @param {number} head
 */
function traceLeftTurnArrow(ctx, shaft, head) {
  const leg = shaft * 0.42;
  const jx = leg * 0.58;
  const jy = leg * 1;
  ctx.moveTo(-leg * 0.62, -1);
  ctx.lineTo(jx, -1);
  ctx.lineTo(jx, jy - 1);
  ctx.moveTo(jx - head * 0.45, jy - head * 0.12 -1);
  ctx.lineTo(jx, jy + head * 0.38 -1);
  ctx.lineTo(jx + head * 0.45, jy - head * 0.12 -1);
}

/**
 * Right-turn arrow path (local +x = along approach toward intersection).
 * Used by pavement markings and the signal left-arrow bulb.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} shaft
 * @param {number} head
 */
function traceRightTurnArrow(ctx, shaft, head) {
  const leg = shaft * 0.42;
  const jx = leg * 0.58;
  const jy = -leg * 1.0;
  ctx.moveTo(-leg * 0.62, +1);
  ctx.lineTo(jx, +1);
  ctx.lineTo(jx, jy + 1);
  ctx.moveTo(jx - head * 0.45, jy + head * 0.12 + 1);
  ctx.lineTo(jx, jy - head * 0.38 + 1);
  ctx.lineTo(jx + head * 0.45, jy + head * 0.12 + 1);
}

/**
 * Stroke-only pavement arrows (local +x = along approach toward intersection).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, angle: number, arrow: string, approach: string }} spec
 */
function drawPavementArrow(ctx, spec) {
  const { x, y, angle, arrow, approach } = spec;
  let draw = arrow;
  // Swap L/R glyph so labels match lane types at each approach rotation (pavement only).
  if (arrow === 'left' || arrow === 'right') {
    draw = arrow === 'left' ? 'right' : 'left';
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = COLORS.STOP_LINE;
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = MARKING.ARROW_STROKE;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2.5;
  const sh = MARKING.ARROW_SHAFT;
  const h = MARKING.ARROW_HEAD;
  ctx.beginPath();
  if (draw === 'straight') {
    ctx.lineJoin = 'round';
    ctx.moveTo(-sh * 0.5, 0);
    ctx.lineTo(sh * 0.42, 0);
    ctx.moveTo(sh * 0.42 - h, -h * 0.48);
    ctx.lineTo(sh * 0.48, 0);
    ctx.lineTo(sh * 0.42 - h, h * 0.48);
  } else if (draw === 'left') {
    traceLeftTurnArrow(ctx, sh, h);
  } else if (draw === 'right') {
    traceRightTurnArrow(ctx, sh, h);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {typeof import('./geometry.js')} geometry
 */
function drawStaticIntersection(ctx, geometry) {
  const L = WORLD.SIZE;
  ctx.save();
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, L, L);

  const vx = geometry.getVerticalRoadXBounds();
  const hy = geometry.getHorizontalRoadYBounds();

  ctx.fillStyle = COLORS.ASPHALT;
  ctx.fillRect(vx.x0, 0, vx.x1 - vx.x0, L);
  ctx.fillRect(0, hy.y0, L, hy.y1 - hy.y0);

  const medians = geometry.getMedianStripRects();
  ctx.fillStyle = COLORS.MEDIAN;
  for (let m = 0; m < medians.length; m++) {
    const r = medians[m];
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeStyle = COLORS.MEDIAN_EDGE;
  ctx.lineWidth = MARKING.EDGE_LINE_WIDTH;
  for (let m = 0; m < medians.length; m++) {
    const r = medians[m];
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  ctx.strokeStyle = COLORS.LANE_LINE;
  ctx.lineWidth = MARKING.LANE_LINE_WIDTH;
  ctx.lineCap = 'butt';
  const boundaries = geometry.getLaneBoundaryPolylines();
  for (let i = 0; i < boundaries.length; i++) {
    const ln = boundaries[i];
    strokeDashedLine(ctx, ln.x1, ln.y1, ln.x2, ln.y2);
  }

  const arrows = geometry.getInboundLaneArrowSpecs();
  for (let a = 0; a < arrows.length; a++) {
    drawPavementArrow(ctx, arrows[a]);
  }

  ctx.strokeStyle = COLORS.STOP_LINE;
  ctx.lineWidth = MARKING.STOP_LINE_WIDTH;
  ctx.lineCap = 'square';
  const stops = geometry.getStopLineSegments();
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  ctx.restore();
}

function signalBulbColor(state) {
  if (state === 'green') return COLORS.SIGNAL_GREEN;
  if (state === 'yellow') return COLORS.SIGNAL_YELLOW;
  if (state === 'red') return COLORS.SIGNAL_RED;
  return COLORS.SIGNAL_OFF;
}

function drawLeftArrowBulb(ctx, lit) {
  const r = SIGNAL.LIGHT_RADIUS;
  const sh = r * (MARKING.ARROW_SHAFT / MARKING.ARROW_HEAD) * 0.58;
  const h = sh * (MARKING.ARROW_HEAD / MARKING.ARROW_SHAFT);
  const leg = sh * 0.42;
  const jx = leg * 0.58;
  const jy = -leg * 0.58;
  const minX = -leg * 0.62;
  const maxX = jx + h * 0.45;
  const minY = jy - h * 0.38 + 1;
  const maxY = h * 0.12 + 1;

  ctx.strokeStyle = lit ? COLORS.SIGNAL_LEFT_ARROW_ON : COLORS.SIGNAL_LEFT_ARROW_OFF;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2.5;
  ctx.save();
  ctx.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
  ctx.beginPath();
  traceRightTurnArrow(ctx, sh, h);
  ctx.stroke();
  ctx.restore();
}

function drawSignalBulb(ctx, y, color, isArrow, arrowLit) {
  const r = SIGNAL.LIGHT_RADIUS;
  ctx.beginPath();
  ctx.arc(0, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (isArrow) {
    ctx.save();
    ctx.translate(0, y);
    drawLeftArrowBulb(ctx, arrowLit);
    ctx.restore();
    return;
  }
}

function drawSignalHead(ctx, layout, approachLights, lampOffsets) {
  const { x, y, facingHeading } = layout;
  const rad = ((facingHeading - 90) * Math.PI) / 180;
  const offsets = lampOffsets;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  const hw = SIGNAL.HEAD_WIDTH / 2;
  const hh = SIGNAL.HEAD_HEIGHT / 2;
  ctx.fillStyle = COLORS.SIGNAL_HOUSING;
  ctx.strokeStyle = COLORS.SIGNAL_HOUSING_STROKE;
  ctx.lineWidth = 1;
  ctx.fillRect(-hw, -hh, SIGNAL.HEAD_WIDTH, SIGNAL.HEAD_HEIGHT);
  ctx.strokeRect(-hw, -hh, SIGNAL.HEAD_WIDTH, SIGNAL.HEAD_HEIGHT);

  const main = approachLights.main;
  const leftOn = approachLights.leftArrow === 'green';
  drawSignalBulb(
    ctx,
    offsets[0],
    signalBulbColor('off'),
    true,
    leftOn
  );
  drawSignalBulb(ctx, offsets[1], signalBulbColor(main === 'red' ? 'red' : 'off'), false, false);
  drawSignalBulb(ctx, offsets[2], signalBulbColor(main === 'yellow' ? 'yellow' : 'off'), false, false);
  drawSignalBulb(ctx, offsets[3], signalBulbColor(main === 'green' ? 'green' : 'off'), false, false);

  ctx.restore();
}

function drawLights(ctx, lights, geometryModule) {
  const layouts = geometryModule.getSignalHeadLayouts();
  const lampOffsets = geometryModule.getSignalLampOffsets();
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];
    drawSignalHead(ctx, layout, lights[layout.approach], lampOffsets);
  }
}

function drawRoundedCar(ctx, car) {
  const len = CAR.LENGTH;
  const w = CAR.WIDTH;
  const r = 2;
  const rad = ((car.heading - 90) * Math.PI) / 180;

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(rad);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.moveTo(-len / 2 + r, -w / 2);
  ctx.lineTo(len / 2 - r, -w / 2);
  ctx.quadraticCurveTo(len / 2, -w / 2, len / 2, -w / 2 + r);
  ctx.lineTo(len / 2, w / 2 - r);
  ctx.quadraticCurveTo(len / 2, w / 2, len / 2 - r, w / 2);
  ctx.lineTo(-len / 2 + r, w / 2);
  ctx.quadraticCurveTo(-len / 2, w / 2, -len / 2, w / 2 - r);
  ctx.lineTo(-len / 2, -w / 2 + r);
  ctx.quadraticCurveTo(-len / 2, -w / 2, -len / 2 + r, -w / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCars(ctx, cars) {
  for (let i = 0; i < cars.length; i++) {
    drawRoundedCar(ctx, cars[i]);
  }
}

function drawHUD(_ctx, _stats, _lights) {
  /* Step 8 */
}

function drawIntersectionDebug(fg, sim) {
  const ic = sim.intersectionController;
  if (!ic) return;

  if (DEBUG_INTERSECTION.showIntersectionZones) {
    const zones = ic.getZoneRects();
    const keys = ['NW', 'NE', 'SW', 'SE'];
    for (let i = 0; i < keys.length; i++) {
      const z = zones[keys[i]];
      const holder = ic.zones[keys[i]];
      fg.fillStyle = holder != null ? 'rgba(200, 80, 60, 0.25)' : 'rgba(80, 140, 200, 0.15)';
      fg.strokeStyle = holder != null ? 'rgba(200, 80, 60, 0.7)' : 'rgba(80, 140, 200, 0.5)';
      fg.lineWidth = 1;
      fg.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      fg.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    }
  }

  if (DEBUG_INTERSECTION.showReservedCars) {
    const cars = sim.allCars;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car.reservedZones || car.reservedZones.length === 0) continue;
      if (car.state !== 'crossing' && car.state !== 'exiting') continue;
      fg.strokeStyle = 'rgba(255, 220, 80, 0.9)';
      fg.lineWidth = 2;
      fg.beginPath();
      fg.arc(car.x, car.y, CAR.LENGTH * 0.65, 0, Math.PI * 2);
      fg.stroke();
    }
  }
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} fgCanvas
   * @param {HTMLCanvasElement} bgCanvas
   * @param {HTMLCanvasElement} signalsCanvas
   */
  constructor(fgCanvas, bgCanvas, signalsCanvas) {
    this.fgCanvas = fgCanvas;
    this.bgCanvas = bgCanvas;
    this.signalsCanvas = signalsCanvas;
    /** @type {typeof import('./geometry.js') | null} */
    this.geometryModule = null;
    this._applyDisplaySize();
  }

  _applyDisplaySize() {
    const { width, height } = computeDisplaySize();
    this.displayWidth = width;
    this.displayHeight = height;
    this.bgCtx = setupCanvas(this.bgCanvas, width, height);
    this.fgCtx = setupCanvas(this.fgCanvas, width, height);
    this.signalsCtx = setupCanvas(this.signalsCanvas, width, height);
    const container = this.bgCanvas.parentElement;
    if (container) {
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
    }
  }

  /** Re-fit canvases to viewport and redraw static layer (call on window resize). */
  resize() {
    this._applyDisplaySize();
    if (this.geometryModule) {
      redrawStaticBackground(this.bgCtx, this.geometryModule);
    }
  }

  /**
   * @param {typeof import('./geometry.js')} geometryModule
   */
  init(geometryModule) {
    this.geometryModule = geometryModule;
    redrawStaticBackground(this.bgCtx, geometryModule);
  }

  /**
   * @param {import('./simulation.js').Simulation} sim
   */
  draw(sim) {
    const L = WORLD.SIZE;
    const fg = this.fgCtx;
    fg.clearRect(0, 0, L, L);
    fg.save();
    fg.translate(0.5, 0.5);
    drawCars(fg, sim.allCars);
    drawIntersectionDebug(fg, sim);
    drawHUD(fg, sim.stats, sim.lights);
    fg.restore();

    const sig = this.signalsCtx;
    sig.clearRect(0, 0, L, L);
    sig.save();
    sig.translate(0.5, 0.5);
    if (this.geometryModule) {
      drawLights(sig, sim.lights, this.geometryModule);
    }
    sig.restore();
  }
}
