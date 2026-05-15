import { WORLD, CAR, COLORS, MARKING, SIGNAL, VIEW } from './constants.js';
import { getApproachDirectionLabel } from './geometry.js';
import { DEBUG_INTERSECTION } from './intersectionController.js';

/** Full viewport width; square display (world is 1:1). */
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

function drawDoubleCenterLine(ctx, x1, y1, x2, y2) {
  const half = MARKING.CENTER_LINE_GAP / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  ctx.strokeStyle = COLORS.CENTER_LINE;
  ctx.lineWidth = MARKING.CENTER_LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(x1 + nx, y1 + ny);
  ctx.lineTo(x2 + nx, y2 + ny);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1 - nx, y1 - ny);
  ctx.lineTo(x2 - nx, y2 - ny);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {typeof import('./geometry.js')} geometry
 */
function drawCrosswalks(ctx, geometry) {
  const box = geometry.getIntersectionInnerRect();
  const slatW = 4;
  const slatGap = 4;
  const slatLen = MARKING.CROSSWALK_SLAT_LEN;
  const lead = MARKING.CROSSWALK_LEAD;
  ctx.save();
  ctx.fillStyle = COLORS.LANE_LINE;

  const topY = box.y0 - slatLen - lead;
  for (let x = box.x0 + 4; x < box.x1 - 4; x += slatW + slatGap) {
    ctx.fillRect(x, topY, slatW, slatLen);
  }

  const botY = box.y1 + lead;
  for (let x = box.x0 + 4; x < box.x1 - 4; x += slatW + slatGap) {
    ctx.fillRect(x, botY, slatW, slatLen);
  }

  const leftX = box.x0 - slatLen - lead;
  for (let y = box.y0 + 4; y < box.y1 - 4; y += slatW + slatGap) {
    ctx.fillRect(leftX, y, slatLen, slatW);
  }

  const rightX = box.x1 + lead;
  for (let y = box.y0 + 4; y < box.y1 - 4; y += slatW + slatGap) {
    ctx.fillRect(rightX, y, slatLen, slatW);
  }
  ctx.restore();
}

function drawFilledStopLines(ctx, segments) {
  const thick = MARKING.STOP_LINE_WIDTH;
  ctx.save();
  ctx.fillStyle = COLORS.STOP_LINE;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const w = Math.abs(s.x2 - s.x1);
    const h = Math.abs(s.y2 - s.y1);
    if (w >= h) {
      ctx.fillRect(Math.min(s.x1, s.x2), s.y1 - thick / 2, w, thick);
    } else {
      ctx.fillRect(s.x1 - thick / 2, Math.min(s.y1, s.y2), thick, h);
    }
  }
  ctx.restore();
}

/**
 * Filled pavement arrow (local +x = along approach toward intersection).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, angle: number, arrow: string, approach: string }} spec
 */
function drawPavementArrow(ctx, spec) {
  const { x, y, angle, arrow } = spec;
  const len = MARKING.ARROW_SHAFT;
  const s = len / 25;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = COLORS.LANE_LINE;
  ctx.strokeStyle = COLORS.LANE_LINE;
  ctx.lineWidth = MARKING.ARROW_STROKE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (arrow === 'straight') {
    const tip = 5 * s;
    const headD = 6 * s;
    const headW = 5 * s;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2 - tip, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(len / 2 - headD, -headW);
    ctx.lineTo(len / 2 - headD, headW);
    ctx.closePath();
    ctx.fill();
  } else if (arrow === 'left') {
    const bend = 2 * s;
    const leg = 9 * s;
    const headY = 13 * s;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(bend, 0);
    ctx.lineTo(bend, -leg);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bend, -headY);
    ctx.lineTo(bend - 5 * s, -8 * s);
    ctx.lineTo(bend + 5 * s, -8 * s);
    ctx.closePath();
    ctx.fill();
  } else if (arrow === 'right') {
    const bend = 2 * s;
    const leg = 9 * s;
    const headY = 13 * s;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(bend, 0);
    ctx.lineTo(bend, leg);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bend, headY);
    ctx.lineTo(bend - 5 * s, 8 * s);
    ctx.lineTo(bend + 5 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {typeof import('./geometry.js')} geometry
 */
function drawStaticIntersection(ctx, geometry) {
  const L = WORLD.SIZE;
  const vx = geometry.getVerticalRoadXBounds();
  const hy = geometry.getHorizontalRoadYBounds();
  const box = geometry.getIntersectionInnerRect();
  const medians = geometry.getMedianStripRects();

  ctx.save();
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, L, L);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = COLORS.ASPHALT;
  ctx.fillRect(vx.x0, 0, vx.x1 - vx.x0, L);
  ctx.fillRect(0, hy.y0, L, hy.y1 - hy.y0);
  ctx.restore();

  ctx.fillStyle = COLORS.ASPHALT;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

  const grd = ctx.createRadialGradient(
    WORLD.CENTER,
    WORLD.CENTER,
    (box.x1 - box.x0) * 0.2,
    WORLD.CENTER,
    WORLD.CENTER,
    (box.x1 - box.x0) * 0.8
  );
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grd;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

  drawLaneMarkings(ctx, geometry, vx, hy, box, medians);

  drawCrosswalks(ctx, geometry);

  const stops = geometry.getStopLineSegments();
  drawFilledStopLines(ctx, stops);

  const arrows = geometry.getInboundLaneArrowSpecs();
  for (let a = 0; a < arrows.length; a++) {
    drawPavementArrow(ctx, arrows[a]);
  }

  ctx.restore();
}

function drawLaneMarkings(ctx, geometry, vx, hy, box, medians) {
  const L = WORLD.SIZE;
  const stop = geometry.getApproachStopBounds();
  ctx.save();
  ctx.strokeStyle = COLORS.LANE_LINE;
  ctx.lineWidth = MARKING.LANE_LINE_WIDTH;
  ctx.lineCap = 'butt';

  const boundaries = geometry.getLaneBoundaryPolylines();
  for (let i = 0; i < boundaries.length; i++) {
    const ln = boundaries[i];
    strokeDashedLine(ctx, ln.x1, ln.y1, ln.x2, ln.y2);
  }

  if (medians.length > 0) {
    const medX0 = medians[0].x;
    const medX1 = medX0 + medians[0].w;
    drawDoubleCenterLine(ctx, medX0, 0, medX0, stop.n);
    drawDoubleCenterLine(ctx, medX1, 0, medX1, stop.n);
    drawDoubleCenterLine(ctx, medX0, stop.s, medX0, L);
    drawDoubleCenterLine(ctx, medX1, stop.s, medX1, L);

    const medY0 = medians[2].y;
    const medY1 = medY0 + medians[2].h;
    drawDoubleCenterLine(ctx, 0, medY0, stop.w, medY0);
    drawDoubleCenterLine(ctx, 0, medY1, stop.w, medY1);
    drawDoubleCenterLine(ctx, stop.e, medY0, L, medY0);
    drawDoubleCenterLine(ctx, stop.e, medY1, L, medY1);
  }

  ctx.strokeStyle = COLORS.LANE_LINE;
  ctx.lineWidth = MARKING.EDGE_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(vx.x0, 0);
  ctx.lineTo(vx.x0, box.y0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(vx.x1, 0);
  ctx.lineTo(vx.x1, box.y0);
  ctx.stroke();
  const edgeL = WORLD.SIZE;
  ctx.beginPath();
  ctx.moveTo(vx.x0, box.y1);
  ctx.lineTo(vx.x0, edgeL);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(vx.x1, box.y1);
  ctx.lineTo(vx.x1, edgeL);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, hy.y0);
  ctx.lineTo(box.x0, hy.y0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, hy.y1);
  ctx.lineTo(box.x0, hy.y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box.x1, hy.y0);
  ctx.lineTo(edgeL, hy.y0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box.x1, hy.y1);
  ctx.lineTo(edgeL, hy.y1);
  ctx.stroke();

  ctx.restore();
}

function drawLamp(ctx, x, y, r, color, lit) {
  if (lit) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = lit ? color : COLORS.SIGNAL_OFF;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (lit) {
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }
}

function drawArrowLamp(ctx, x, y, r, state) {
  const lit = state === 'green';
  const amb = state === 'yellow';
  const active = lit || amb;
  const litColor = lit ? COLORS.SIGNAL_GREEN : COLORS.SIGNAL_YELLOW;

  if (active) {
    ctx.shadowColor = litColor;
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? litColor : COLORS.SIGNAL_OFF;
  ctx.fill();
  ctx.shadowBlur = 0;

  if (active) {
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = active ? COLORS.SIGNAL_LEFT_ARROW_ON : COLORS.SIGNAL_LEFT_ARROW_OFF;
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, 0);
  ctx.lineTo(-r * 0.05, -r * 0.5);
  ctx.lineTo(-r * 0.05, -r * 0.18);
  ctx.lineTo(r * 0.58, -r * 0.18);
  ctx.lineTo(r * 0.58, r * 0.18);
  ctx.lineTo(-r * 0.05, r * 0.18);
  ctx.lineTo(-r * 0.05, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawApproachLabel(ctx, approach, housingHeight) {
  const label = getApproachDirectionLabel(approach);
  ctx.save();
  ctx.font = SIGNAL.LABEL_FONT;
  ctx.fillStyle = COLORS.SIGNAL_LABEL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 0, housingHeight / 2 + SIGNAL.LABEL_GAP);
  ctx.restore();
}

function drawSignalHead(ctx, layout, approachLights) {
  const { x, y, rotationRad, approach } = layout;
  const rad =
    rotationRad ??
    ((layout.facingHeading - 90) * Math.PI) / 180;
  const main = approachLights.main;
  const leftState = approachLights.leftArrow === 'green' ? 'green' : 'red';

  const lampR = SIGNAL.LIGHT_RADIUS;
  const pad = SIGNAL.HEAD_PADDING;
  const innerGap = SIGNAL.INNER_GAP;
  const slot = lampR * 2 + innerGap;
  const w = SIGNAL.HEAD_WIDTH;
  const h = SIGNAL.HEAD_HEIGHT;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  ctx.fillStyle = COLORS.SIGNAL_HOUSING;
  ctx.fillRect(-SIGNAL.POST_W / 2, -SIGNAL.POST_H, SIGNAL.POST_W, SIGNAL.POST_H);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(ctx, -w / 2 + 1, -h / 2 + 2, w, h, 6);
  ctx.fill();

  ctx.fillStyle = COLORS.SIGNAL_HOUSING;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();

  ctx.strokeStyle = COLORS.SIGNAL_HOUSING_STROKE;
  ctx.lineWidth = 1;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const xd = -w / 2 + pad + lampR + (i - 0.5) * slot - innerGap / 2;
    ctx.beginPath();
    ctx.moveTo(xd, -h / 2 + 3);
    ctx.lineTo(xd, h / 2 - 3);
    ctx.stroke();
  }

  const lampX = [];
  for (let i = 0; i < 4; i++) {
    lampX.push(-w / 2 + pad + lampR + i * slot);
  }

  drawArrowLamp(ctx, lampX[0], 0, lampR, leftState);
  drawLamp(ctx, lampX[1], 0, lampR, COLORS.SIGNAL_RED, main === 'red');
  drawLamp(ctx, lampX[2], 0, lampR, COLORS.SIGNAL_YELLOW, main === 'yellow');
  drawLamp(ctx, lampX[3], 0, lampR, COLORS.SIGNAL_GREEN, main === 'green');

  drawApproachLabel(ctx, approach, h);

  ctx.restore();
}

function drawLights(ctx, lights, geometryModule) {
  const layouts = geometryModule.getSignalHeadLayouts();
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];
    drawSignalHead(ctx, layout, lights[layout.approach]);
  }
}

function carShowsBrakeLights(car) {
  if (car.state === 'crossing' || car.state === 'exiting') return false;
  const v = car.speed ?? 0;
  return v < CAR.MAX_SPEED * 0.5 && (car.state === 'stopped' || v < CAR.MAX_SPEED * 0.35);
}

function drawCar(ctx, car) {
  const len = CAR.LENGTH;
  const w = CAR.WIDTH;
  const r = 2.5;
  const rad = ((car.heading - 90) * Math.PI) / 180;

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(rad);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(ctx, -len / 2 + 1, -w / 2 + 2, len, w, r);
  ctx.fill();

  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -w / 2, len, w, r);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, -len / 2 + 3, -w / 2 + 1.4, len - 6, w - 2.8, 1.5);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(len / 2 - 4, -w / 2 + 1.5);
  ctx.lineTo(len / 2 - 4, w / 2 - 1.5);
  ctx.stroke();

  if (carShowsBrakeLights(car)) {
    ctx.fillStyle = '#E2503C';
    ctx.fillRect(-len / 2 + 0.5, -w / 2 + 1.5, 1.2, 1.5);
    ctx.fillRect(-len / 2 + 0.5, w / 2 - 3, 1.2, 1.5);
  }

  ctx.restore();
}

function drawCars(ctx, cars) {
  for (let i = 0; i < cars.length; i++) {
    drawCar(ctx, cars[i]);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
    this.viewportEl = null;
    this.compassNeedleEl = null;
    this.view = { panX: 0, panY: 0, zoom: 1, rotation: 0 };
    this._applyDisplaySize();
  }

  resetView() {
    this.view.zoom = 1;
    this.view.rotation = 0;
    this._centerView();
    this._applyViewportTransform();
  }

  _centerView() {
    const container = this.viewportEl?.parentElement;
    if (!container) {
      this.view.panX = 0;
      this.view.panY = 0;
      return;
    }
    const w = this.displayWidth;
    const h = this.displayHeight;
    this.view.panX = container.clientWidth / 2 - w / 2;
    this.view.panY = container.clientHeight / 2 - h / 2;
  }

  _screenPivot() {
    const container = this.viewportEl?.parentElement;
    if (!container) return { x: 0, y: 0 };
    return { x: container.clientWidth / 2, y: container.clientHeight / 2 };
  }

  _canvasCenter() {
    const w = this.displayWidth;
    const h = this.displayHeight;
    return { x: this.view.panX + w / 2, y: this.view.panY + h / 2 };
  }

  _applyViewportTransform() {
    if (!this.viewportEl) return;
    const { panX, panY, zoom, rotation } = this.view;
    const w = this.displayWidth;
    const h = this.displayHeight;
    this.viewportEl.style.left = `${panX}px`;
    this.viewportEl.style.top = `${panY}px`;
    this.viewportEl.style.transformOrigin = `${w / 2}px ${h / 2}px`;
    this.viewportEl.style.transform = `rotate(${rotation}rad) scale(${zoom})`;
    this._updateCompass();
  }

  _updateCompass() {
    if (!this.compassNeedleEl) return;
    this.compassNeedleEl.style.transform = `rotate(${-this.view.rotation}rad)`;
  }

  /** Rotate view around screen center (maps-style: north can point any direction on screen). */
  _setRotation(newRotation) {
    const pivot = this._screenPivot();
    const center = this._canvasCenter();
    const w = this.displayWidth;
    const h = this.displayHeight;
    const delta = newRotation - this.view.rotation;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const dx = center.x - pivot.x;
    const dy = center.y - pivot.y;
    const cx2 = pivot.x + dx * cos - dy * sin;
    const cy2 = pivot.y + dx * sin + dy * cos;
    this.view.panX = cx2 - w / 2;
    this.view.panY = cy2 - h / 2;
    this.view.rotation = newRotation;
    this._applyViewportTransform();
  }

  _zoomViewAt(clientX, clientY, factor) {
    const el = this.viewportEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ux = (clientX - rect.left) / rect.width;
    const uy = (clientY - rect.top) / rect.height;
    this.view.zoom = clamp(this.view.zoom * factor, VIEW.MIN_ZOOM, VIEW.MAX_ZOOM);
    this._applyViewportTransform();
    const rect2 = el.getBoundingClientRect();
    this.view.panX += clientX - rect2.left - ux * rect2.width;
    this.view.panY += clientY - rect2.top - uy * rect2.height;
    this._applyViewportTransform();
  }

  _wheelRotateDelta(e) {
    if (e.deltaY !== 0) return e.deltaY;
    if (e.deltaX !== 0) return e.deltaX;
    return 0;
  }

  /**
   * @param {HTMLElement} container
   */
  attachViewportControls(container) {
    const viewport =
      container.querySelector('#canvas-viewport') ?? container;
    this.viewportEl = viewport;
    this.compassNeedleEl = document.getElementById('compass-needle');

    let dragMode = 'none';
    let dragStartX = 0;
    let dragStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let rotStartAngle = 0;
    let rotStartRotation = 0;

    const endDrag = () => {
      dragMode = 'none';
      viewport.classList.remove('is-panning', 'is-rotating');
    };

    const pivotClient = () => {
      const p = this._screenPivot();
      const rect = container.getBoundingClientRect();
      return { x: rect.left + p.x, y: rect.top + p.y };
    };

    viewport.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    viewport.addEventListener('pointerdown', (e) => {
      const rotateGesture = e.button === 2 || (e.button === 0 && e.altKey);

      if (rotateGesture) {
        e.preventDefault();
        const pivot = pivotClient();
        dragMode = 'rotate';
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        rotStartAngle = Math.atan2(
          e.clientY - pivot.y,
          e.clientX - pivot.x
        );
        rotStartRotation = this.view.rotation;
        viewport.classList.add('is-rotating');
        viewport.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;
      dragMode = 'pan';
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panOriginX = this.view.panX;
      panOriginY = this.view.panY;
      viewport.classList.add('is-panning');
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
      if (dragMode === 'pan') {
        this.view.panX = panOriginX + (e.clientX - dragStartX);
        this.view.panY = panOriginY + (e.clientY - dragStartY);
        this._applyViewportTransform();
        return;
      }
      if (dragMode === 'rotate') {
        const pivot = pivotClient();
        const angle = Math.atan2(e.clientY - pivot.y, e.clientX - pivot.x);
        this._setRotation(rotStartRotation + (angle - rotStartAngle));
      }
    });

    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const delta = this._wheelRotateDelta(e);
          if (delta !== 0) {
            this._setRotation(
              this.view.rotation - delta * VIEW.ROTATE_WHEEL_SENSITIVITY
            );
          }
          return;
        }
        const factor = Math.exp(-e.deltaY * VIEW.ZOOM_WHEEL_SENSITIVITY);
        this._zoomViewAt(e.clientX, e.clientY, factor);
      },
      { passive: false }
    );

    viewport.addEventListener('dblclick', () => {
      this.resetView();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.resetView();
      }
    });

    this._centerView();
    this._applyViewportTransform();
  }

  _applyDisplaySize() {
    const { width, height } = computeDisplaySize();
    this.displayWidth = width;
    this.displayHeight = height;
    this.bgCtx = setupCanvas(this.bgCanvas, width, height);
    this.fgCtx = setupCanvas(this.fgCanvas, width, height);
    this.signalsCtx = setupCanvas(this.signalsCanvas, width, height);
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
