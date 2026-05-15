/**
 * Coordinate conventions (architecture §2) — do not deviate.
 *
 * Dual carriageway: facing **toward** the intersection, cross-section reads
 *   [ inbound | median | outbound ]
 * (inbound on the side swapped from the earlier layout; still derived from WORLD.CENTER / ROAD.*).
 */

import { WORLD, ROAD, MARKING, CAR, SIGNAL } from './constants.js';

const { SIZE: W, CENTER: CX, CENTER: CY } = WORLD;

const LW_IN = ROAD.LANE_WIDTH;
const LW_OUT = ROAD.OUTBOUND_LANE_WIDTH;
const OUT_CLEAR = ROAD.OUTBOUND_MEDIAN_CLEARANCE;
const LPD = ROAD.LANES_PER_DIRECTION;
const MED = ROAD.MEDIAN_WIDTH;
const TW = ROAD.TOTAL_WIDTH;
const HALF_ROAD = TW / 2;
const BLOCK_IN = LPD * LW_IN;
const BLOCK_OUT = OUT_CLEAR + LPD * LW_OUT;
/** Each carriageway slab fits both inbound (narrow) and outbound (wide) lane sets. */
const BLOCK_SIDE = ROAD.BLOCK_SIDE;
/** Inbound lanes split the full slab width evenly (avoids a wide outer lane). */
const LW_IN_EQUAL = BLOCK_SIDE / LPD;

const VX0 = CX - HALF_ROAD;
const VX1 = CX + HALF_ROAD;
const MED_X0 = VX0 + BLOCK_SIDE;
const MED_X1 = MED_X0 + MED;
const INB_X0 = MED_X1;
const INB_X1 = VX1;

const HY0 = CY - HALF_ROAD;
const HY1 = CY + HALF_ROAD;
const MED_Y0 = HY0 + BLOCK_SIDE;
const MED_Y1 = MED_Y0 + MED;
const INB_Y0 = MED_Y1;
const INB_Y1 = HY1;

const STOP_OFFSET = BLOCK_SIDE + MED / 2;

/** Intersection pavement box (crosswalks sit just outside these edges). */
const INTERSECTION_N = CY - STOP_OFFSET;
const INTERSECTION_S = CY + STOP_OFFSET;
const INTERSECTION_W = CX - STOP_OFFSET;
const INTERSECTION_E = CX + STOP_OFFSET;

/** Inbound stop lines sit before the crosswalk on each approach. */
const STOP_LINE_SETBACK =
  MARKING.CROSSWALK_SLAT_LEN +
  MARKING.CROSSWALK_LEAD +
  MARKING.STOP_LINE_CROSSWALK_GAP +
  MARKING.STOP_LINE_WIDTH / 2;

const STOP_N = INTERSECTION_N - STOP_LINE_SETBACK;
const STOP_S = INTERSECTION_S + STOP_LINE_SETBACK;
const STOP_W = INTERSECTION_W - STOP_LINE_SETBACK;
const STOP_E = INTERSECTION_E + STOP_LINE_SETBACK;

const LANE_TYPES = ['left', 'straight', 'straight', 'right'];

/** Lane type by index — cross-section order differs by approach (y-down canvas). */
function laneTypeForIndex(approach, index) {
  if (approach === 'E' || approach === 'N') {
    return ['right', 'straight', 'straight', 'left'][index];
  }
  return LANE_TYPES[index];
}

/** Unit forward (toward intersection) in canvas coords (+y down). */
const FWD = {
  N: { x: 0, y: 1 },
  S: { x: 0, y: -1 },
  E: { x: -1, y: 0 },
  W: { x: 1, y: 0 },
};

function laneTypeSuffix(type, index) {
  if (type !== 'straight') return '';
  return index === 1 ? '_1' : '_2';
}

/** Vertical slab low-x … high-x: west block (outbound) | median | east block (inbound). */
function inboundCenterX_N(index) {
  return VX0 + LW_IN_EQUAL * (index + 0.5);
}

/** S inbound (east block): left at +x from median — centers increase. */
function inboundCenterX_S(index) {
  return INB_X0 + LW_IN_EQUAL * (index + 0.5);
}

/** N outbound (east block) — wider lanes, set back from median. */
function outboundCenterX_N(index) {
  return MED_X1 + OUT_CLEAR + LW_OUT * (index + 0.5);
}

/** S outbound (west block) — wider lanes, set back from median. */
function outboundCenterX_S(index) {
  return MED_X0 - OUT_CLEAR - LW_OUT * (index + 0.5);
}

/** W inbound (north / high-y block). */
function inboundCenterY_W(index) {
  return MED_Y1 + LW_IN_EQUAL * (index + 0.5);
}

/** W outbound (south / low-y block). */
function outboundCenterY_W(index) {
  return MED_Y0 - OUT_CLEAR - LW_OUT * (index + 0.5);
}

/** E inbound (south / low-y block). */
function inboundCenterY_E(index) {
  return HY0 + LW_IN_EQUAL * (index + 0.5);
}

/** E outbound (north / high-y block). */
function outboundCenterY_E(index) {
  return MED_Y1 + OUT_CLEAR + LW_OUT * (index + 0.5);
}

/**
 * @param {'inbound'|'outbound'} role
 * @param {'N'|'S'} approach
 * @param {number} index 0..3
 */
function makeVerticalLane(role, approach, index) {
  const type = role === 'inbound' ? laneTypeForIndex(approach, index) : LANE_TYPES[index];
  const suf = laneTypeSuffix(type, index);
  const id = `${approach}_${role === 'inbound' ? 'in' : 'out'}_${type}${suf}`;

  if (approach === 'N') {
    const centerX = role === 'inbound' ? inboundCenterX_N(index) : outboundCenterX_N(index);
    const lane = {
      id,
      approach: 'N',
      role,
      type: type === 'straight' ? 'straight' : type,
      centerX,
    };
    if (role === 'inbound') lane.stopLineY = STOP_N;
    return lane;
  }

  const centerX = role === 'inbound' ? inboundCenterX_S(index) : outboundCenterX_S(index);
  const lane = {
    id,
    approach: 'S',
    role,
    type: type === 'straight' ? 'straight' : type,
    centerX,
  };
  if (role === 'inbound') lane.stopLineY = STOP_S;
  return lane;
}

/**
 * @param {'inbound'|'outbound'} role
 * @param {'E'|'W'} approach
 * @param {number} index 0..3
 */
function makeHorizontalLane(role, approach, index) {
  const type = laneTypeForIndex(approach, index);
  const suf = laneTypeSuffix(type, index);
  const id = `${approach}_${role === 'inbound' ? 'in' : 'out'}_${type}${suf}`;

  if (approach === 'E') {
    const centerY = role === 'inbound' ? inboundCenterY_E(index) : outboundCenterY_E(index);
    const lane = {
      id,
      approach: 'E',
      role,
      type: type === 'straight' ? 'straight' : type,
      centerY,
    };
    if (role === 'inbound') lane.stopLineX = STOP_E;
    return lane;
  }

  const centerY = role === 'inbound' ? inboundCenterY_W(index) : outboundCenterY_W(index);
  const lane = {
    id,
    approach: 'W',
    role,
    type: type === 'straight' ? 'straight' : type,
    centerY,
  };
  if (role === 'inbound') lane.stopLineX = STOP_W;
  return lane;
}

function buildApproachLaneGroups() {
  const groups = [];
  const approaches = ['N', 'S', 'E', 'W'];
  for (let a = 0; a < approaches.length; a++) {
    const ap = approaches[a];
    const inbound = [];
    const outbound = [];
    for (let i = 0; i < LPD; i++) {
      if (ap === 'N' || ap === 'S') {
        inbound.push(makeVerticalLane('inbound', ap, i));
        outbound.push(makeVerticalLane('outbound', ap, i));
      } else {
        inbound.push(makeHorizontalLane('inbound', ap, i));
        outbound.push(makeHorizontalLane('outbound', ap, i));
      }
    }
    groups.push({ approach: ap, inbound, outbound });
  }
  return groups;
}

const APPROACH_LANE_GROUPS = buildApproachLaneGroups();

export const DESPAWN_BOUNDS = {
  minX: -WORLD.DESPAWN_MARGIN,
  maxX: WORLD.SIZE + WORLD.DESPAWN_MARGIN,
  minY: -WORLD.DESPAWN_MARGIN,
  maxY: WORLD.SIZE + WORLD.DESPAWN_MARGIN,
};

function rotateQuarterCwAroundCenter(pt, quarters) {
  let dx = pt.x - CX;
  let dy = pt.y - CY;
  const q = ((quarters % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    const ndx = -dy;
    const ndy = dx;
    dx = ndx;
    dy = ndy;
  }
  return { x: CX + dx, y: CY + dy };
}

function rotateBezierQuarterCw(b, quarters) {
  return {
    p0: rotateQuarterCwAroundCenter(b.p0, quarters),
    p1: rotateQuarterCwAroundCenter(b.p1, quarters),
    p2: rotateQuarterCwAroundCenter(b.p2, quarters),
  };
}

const lx = inboundCenterX_N(0);
const rx = inboundCenterX_N(3);
const straightMidX = (inboundCenterX_N(1) + inboundCenterX_N(2)) / 2;

const P0_APPROACH_OFFSET = ROAD.LANE_WIDTH;
const LW = LW_IN;

const N_LEFT = {
  p0: { x: lx, y: STOP_N - P0_APPROACH_OFFSET },
  p1: { x: lx, y: CY },
  p2: { x: INTERSECTION_W - LW, y: HY0 + 1.5 * LW },
};

const N_STRAIGHT = {
  p0: { x: straightMidX, y: STOP_N },
  p1: { x: straightMidX, y: CY },
  p2: { x: straightMidX, y: INTERSECTION_S },
};

const N_RIGHT = {
  p0: { x: rx, y: STOP_N - P0_APPROACH_OFFSET },
  p1: { x: INTERSECTION_E - 2 * LW, y: CY },
  p2: { x: INTERSECTION_E, y: HY0 + 2.5 * LW },
};

export const waypoints = {
  N_left: N_LEFT,
  N_straight: N_STRAIGHT,
  N_right: N_RIGHT,
  E_left: rotateBezierQuarterCw(N_LEFT, 1),
  E_straight: rotateBezierQuarterCw(N_STRAIGHT, 1),
  E_right: rotateBezierQuarterCw(N_RIGHT, 1),
  S_left: rotateBezierQuarterCw(N_LEFT, 2),
  S_straight: rotateBezierQuarterCw(N_STRAIGHT, 2),
  S_right: rotateBezierQuarterCw(N_RIGHT, 2),
  W_left: rotateBezierQuarterCw(N_LEFT, 3),
  W_straight: rotateBezierQuarterCw(N_STRAIGHT, 3),
  W_right: rotateBezierQuarterCw(N_RIGHT, 3),
};

export function getApproachLaneGroups() {
  return APPROACH_LANE_GROUPS;
}

export function createLanes() {
  const lanes = [];
  for (let g = 0; g < APPROACH_LANE_GROUPS.length; g++) {
    const group = APPROACH_LANE_GROUPS[g];
    for (let i = 0; i < group.inbound.length; i++) {
      lanes.push({ ...group.inbound[i], queue: [] });
    }
  }
  return lanes;
}

export const APPROACH_ORDER = ['N', 'S', 'E', 'W'];

/** Unit vector toward intersection (+y down). */
export function getApproachForward(approach) {
  return FWD[approach];
}

/** Travel-direction label for signal heads (canvas +y down). */
export function getApproachDirectionLabel(approach) {
  const f = FWD[approach];
  if (f.y > 0) return 'Southbound';
  if (f.y < 0) return 'Northbound';
  if (f.x < 0) return 'Westbound';
  return 'Eastbound';
}

/** Heading in degrees (0 = up, clockwise), per architecture §2. */
export function getApproachHeading(approach) {
  const f = FWD[approach];
  return (Math.atan2(f.y, f.x) * 180) / Math.PI + 90;
}

/**
 * Spawn point at map edge along inbound lane centerline.
 * @param {{ approach: string, centerX?: number, centerY?: number }} lane
 */
export function getInboundSpawnPoint(lane) {
  const f = FWD[lane.approach];
  const heading = getApproachHeading(lane.approach);
  const margin = WORLD.DESPAWN_MARGIN;
  if (lane.centerX !== undefined) {
    return {
      x: lane.centerX,
      y: CY - f.y * (CY + margin),
      heading,
    };
  }
  return {
    x: CX - f.x * (CX + margin),
    y: lane.centerY,
    heading,
  };
}

/** True once the car has passed WORLD.CENTER along its approach axis. */
export function isPastIntersectionCenter(car) {
  const f = FWD[car.approach];
  const dx = car.x - CX;
  const dy = car.y - CY;
  return dx * f.x + dy * f.y > 0;
}

/** Center of inbound lane block (lanes each signal controls). */
function inboundBlockCenter(approach) {
  if (approach === 'N') return { x: (VX0 + MED_X0) / 2, y: null };
  if (approach === 'S') return { x: (INB_X0 + INB_X1) / 2, y: null };
  if (approach === 'W') return { x: null, y: (MED_Y1 + INB_Y1) / 2 };
  return { x: null, y: (HY0 + MED_Y0) / 2 };
}

/** Center of outbound block — opposite inbound; no internal dashed lane lines. */
function outboundBlockCenter(approach) {
  if (approach === 'N') return { x: (INB_X0 + INB_X1) / 2, y: null };
  if (approach === 'S') return { x: (VX0 + MED_X0) / 2, y: null };
  if (approach === 'W') return { x: null, y: (HY0 + MED_Y0) / 2 };
  return { x: null, y: (MED_Y1 + INB_Y1) / 2 };
}

/** Heading the signal face points toward oncoming drivers (opposite travel direction). */
export function getSignalFacingHeading(approach) {
  const h = getApproachHeading(approach) + 180;
  return h >= 360 ? h - 360 : h;
}

/** X positions of lamp centers in horizontal housing (local coords, origin at center). */
export function getSignalLampOffsets() {
  const r = SIGNAL.LIGHT_RADIUS;
  const slot = SIGNAL.BULB_DIAMETER + SIGNAL.INNER_GAP;
  const first = -SIGNAL.HEAD_WIDTH / 2 + SIGNAL.HEAD_PADDING + r;
  return [first, first + slot, first + slot * 2, first + slot * 3];
}

/** Distance from housing center to the face pointing toward (towardX, towardY). */
function housingHalfToward(facingHeading, towardX, towardY) {
  const rad = ((facingHeading - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = SIGNAL.HEAD_WIDTH / 2;
  const hh = SIGNAL.HEAD_HEIGHT / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  let maxDot = 0;
  for (let i = 0; i < corners.length; i++) {
    const lx = corners[i][0];
    const ly = corners[i][1];
    const wx = lx * cos - ly * sin;
    const wy = lx * sin + ly * cos;
    const dot = wx * towardX + wy * towardY;
    if (dot > maxDot) maxDot = dot;
  }
  return maxDot;
}

/**
 * Signal heads at the driver's-right corner on the far side of the intersection (RHD).
 * Matches design reference: horizontal housing, one head per approach.
 */
export function getSignalHeadLayouts() {
  const off = SIGNAL.CORNER_OFFSET ?? SIGNAL.INTERSECTION_INSET ?? 18;
  const box = getIntersectionInnerRect();
  const layouts = [];

  const hN = getSignalFacingHeading('N');
  layouts.push({
    approach: 'N',
    x: box.x0 - off - housingHalfToward(hN, -1, 0),
    y: box.y1 + off + housingHalfToward(hN, 0, 1),
    facingHeading: hN,
    rotationRad: Math.PI,
  });

  const hS = getSignalFacingHeading('S');
  layouts.push({
    approach: 'S',
    x: box.x1 + off + housingHalfToward(hS, 1, 0),
    y: box.y0 - off - housingHalfToward(hS, 0, -1),
    facingHeading: hS,
    rotationRad: 0,
  });

  const hE = getSignalFacingHeading('E');
  layouts.push({
    approach: 'E',
    x: box.x0 - off - housingHalfToward(hE, -1, 0),
    y: box.y0 - off - housingHalfToward(hE, 0, -1),
    facingHeading: hE,
    rotationRad: -Math.PI / 2,
  });

  const hW = getSignalFacingHeading('W');
  layouts.push({
    approach: 'W',
    x: box.x1 + off + housingHalfToward(hW, 1, 0),
    y: box.y1 + off + housingHalfToward(hW, 0, 1),
    facingHeading: hW,
    rotationRad: Math.PI / 2,
  });

  return layouts;
}

/**
 * Car center when stopped before the inbound stop line (bumper clear of white bar).
 * @param {{ approach: string, centerX?: number, centerY?: number, stopLineX?: number, stopLineY?: number }} lane
 */
export function getInboundStopCenter(lane) {
  const f = FWD[lane.approach];
  const bumperOffset = CAR.LENGTH / 2 + CAR.STOP_BACKUP;
  if (lane.centerX !== undefined && lane.stopLineY !== undefined) {
    return {
      x: lane.centerX,
      y: lane.stopLineY - f.y * bumperOffset,
    };
  }
  return {
    x: lane.stopLineX - f.x * bumperOffset,
    y: lane.centerY,
  };
}

export function getVerticalRoadXBounds() {
  return { x0: VX0, x1: VX1 };
}

export function getHorizontalRoadYBounds() {
  return { y0: HY0, y1: HY1 };
}

export function getIntersectionInnerRect() {
  return {
    x0: INTERSECTION_W,
    y0: INTERSECTION_N,
    x1: INTERSECTION_E,
    y1: INTERSECTION_S,
  };
}

/** Stop-line positions for clipping markings before crosswalks. */
export function getApproachStopBounds() {
  return { n: STOP_N, s: STOP_S, w: STOP_W, e: STOP_E };
}

/** Four quadrant zones inside the intersection box (for occupancy). */
export function getIntersectionZoneRects() {
  const r = getIntersectionInnerRect();
  return {
    NW: { id: 'NW', x0: r.x0, y0: r.y0, x1: CX, y1: CY },
    NE: { id: 'NE', x0: CX, y0: r.y0, x1: r.x1, y1: CY },
    SW: { id: 'SW', x0: r.x0, y0: CY, x1: CX, y1: r.y1 },
    SE: { id: 'SE', x0: CX, y0: CY, x1: r.x1, y1: r.y1 },
  };
}

/** @param {{ p0: {x:number,y:number}, p1: {x:number,y:number}, p2: {x:number,y:number} }} b */
export function evalQuadraticBezier(b, t) {
  const u = 1 - t;
  return {
    x: u * u * b.p0.x + 2 * u * t * b.p1.x + t * t * b.p2.x,
    y: u * u * b.p0.y + 2 * u * t * b.p1.y + t * t * b.p2.y,
  };
}

/** Bezier tangent vector (not normalized). */
export function bezierTangent(b, t) {
  const u = 1 - t;
  return {
    x: 2 * u * (b.p1.x - b.p0.x) + 2 * t * (b.p2.x - b.p1.x),
    y: 2 * u * (b.p1.y - b.p0.y) + 2 * t * (b.p2.y - b.p1.y),
  };
}

/** @param {{ p0: object, p1: object, p2: object, p3: object }} b */
export function evalCubicBezier(b, t) {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * b.p0.x + 3 * u2 * t * b.p1.x + 3 * u * t2 * b.p2.x + t3 * b.p3.x,
    y: u3 * b.p0.y + 3 * u2 * t * b.p1.y + 3 * u * t2 * b.p2.y + t3 * b.p3.y,
  };
}

/** Cubic tangent (not normalized). */
export function cubicBezierTangent(b, t) {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (b.p1.x - b.p0.x) +
      6 * u * t * (b.p2.x - b.p1.x) +
      3 * t * t * (b.p3.x - b.p2.x),
    y:
      3 * u * u * (b.p1.y - b.p0.y) +
      6 * u * t * (b.p2.y - b.p1.y) +
      3 * t * t * (b.p3.y - b.p2.y),
  };
}

export function isCubicPath(path) {
  return path.p3 != null;
}

export function evalPath(path, t) {
  if (isCubicPath(path)) return evalCubicBezier(path, t);
  return evalQuadraticBezier(path, t);
}

export function pathTangent(path, t) {
  if (isCubicPath(path)) return cubicBezierTangent(path, t);
  return bezierTangent(path, t);
}

export function pathTangentUnit(path, t) {
  const tan = pathTangent(path, t);
  const len = Math.hypot(tan.x, tan.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: tan.x / len, y: tan.y / len };
}

export function pathTangentHeading(path, t) {
  const tan = pathTangent(path, t);
  return (Math.atan2(tan.y, tan.x) * 180) / Math.PI + 90;
}

/** Unit tangent along path (travel direction). */
export function bezierTangentUnit(b, t) {
  const tan = bezierTangent(b, t);
  const len = Math.hypot(tan.x, tan.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: tan.x / len, y: tan.y / len };
}

/** Heading in degrees (0 = up, clockwise) from bezier tangent. */
export function bezierTangentHeading(b, t) {
  const tan = bezierTangent(b, t);
  return (Math.atan2(tan.y, tan.x) * 180) / Math.PI + 90;
}

/** Closest t in [0,1] for a world point on the path (for resuming without snapping). */
export function estimateBezierT(b, x, y) {
  return Math.min(estimatePathT(b, x, y), 0.15);
}

/** Closest t in [0,1] on any path (quadratic or cubic). */
export function estimatePathT(path, x, y) {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const p = evalPath(path, t);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return bestT;
}

/** Arc length of a path (sampled). */
export function approximatePathLength(path, samples = 32) {
  let len = 0;
  let prev = evalPath(path, 0);
  for (let i = 1; i <= samples; i++) {
    const p = evalPath(path, i / samples);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/**
 * Arc-length lookup for a path (uniform t samples).
 * @returns {{ ts: number[], ss: number[], total: number }}
 */
export function buildPathArcTable(path, samples = 64) {
  const ts = new Array(samples + 1);
  const ss = new Array(samples + 1);
  ts[0] = 0;
  ss[0] = 0;
  let prev = evalPath(path, 0);
  for (let i = 1; i <= samples; i++) {
    ts[i] = i / samples;
    const p = evalPath(path, ts[i]);
    ss[i] = ss[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return { ts, ss, total: ss[samples] };
}

/** Arc length from path start to parameter t. */
export function pathArcLengthAtT(table, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const { ts, ss } = table;
  if (clamped <= ts[0]) return ss[0];
  if (clamped >= ts[ts.length - 1]) return ss[ss.length - 1];
  for (let i = 1; i < ts.length; i++) {
    if (clamped <= ts[i]) {
      const u = (clamped - ts[i - 1]) / (ts[i] - ts[i - 1]);
      return ss[i - 1] + u * (ss[i] - ss[i - 1]);
    }
  }
  return ss[ss.length - 1];
}

/** Path parameter t at arc length s from the start. */
export function pathTAtArcLength(table, s) {
  const target = Math.max(0, Math.min(table.total, s));
  const { ts, ss } = table;
  if (target <= ss[0]) return ts[0];
  if (target >= ss[ss.length - 1]) return ts[ts.length - 1];
  for (let i = 1; i < ss.length; i++) {
    if (target <= ss[i]) {
      const u = (target - ss[i - 1]) / (ss[i] - ss[i - 1]);
      return ts[i - 1] + u * (ts[i] - ts[i - 1]);
    }
  }
  return ts[ts.length - 1];
}

/**
 * Waypoint key for geometry.waypoints (right turns; left uses buildLeftTurnPathForLane).
 * @param {{ approach: string, movementType: string, laneType?: string }} car
 */
export function getWaypointKey(car) {
  if (car.movementType === 'left') return `${car.approach}_left`;
  if (car.laneType === 'right') return `${car.approach}_right`;
  return `${car.approach}_straight`;
}

/** Outbound approach reached by a driver-left turn from each inbound arm. */
function leftTurnDestinationApproach(fromApproach) {
  switch (fromApproach) {
    case 'N':
      return 'E';
    case 'E':
      return 'S';
    case 'S':
      return 'W';
    case 'W':
      return 'N';
    default:
      throw new Error(`Unknown approach: ${fromApproach}`);
  }
}

/** Outbound approach reached by a driver-right turn from each inbound arm. */
function rightTurnDestinationApproach(fromApproach) {
  switch (fromApproach) {
    case 'S':
      return 'E';
    case 'E':
      return 'N';
    case 'N':
      return 'W';
    case 'W':
      return 'S';
    default:
      throw new Error(`Unknown approach: ${fromApproach}`);
  }
}

function findOutboundLane(approach, type) {
  const group = APPROACH_LANE_GROUPS.find((g) => g.approach === approach);
  return group.outbound.find((l) => l.type === type);
}

/** Travel direction away from the intersection on an outbound arm. */
function outboundTravelForward(approach) {
  const f = FWD[approach];
  return { x: -f.x, y: -f.y };
}

/** Outbound lane on the driver's left (by travel direction), not lane-type label. */
function findOutboundLeftmostLane(approach) {
  const group = APPROACH_LANE_GROUPS.find((g) => g.approach === approach);
  const out = outboundTravelForward(approach);
  const left = { x: out.y, y: -out.x };
  return group.outbound.reduce((best, lane) => {
    const score = (lane.centerX ?? CX) * left.x + (lane.centerY ?? CY) * left.y;
    const bestScore = (best.centerX ?? CX) * left.x + (best.centerY ?? CY) * left.y;
    return score > bestScore ? lane : best;
  });
}

/** Left-turn merge target: driver-leftmost outbound lane for travel direction. */
function findOutboundLeftTurnLane(destApproach) {
  return findOutboundLeftmostLane(destApproach);
}

/** On outbound left lane centerline at the intersection edge (start of straight exit). */
function outboundLeftLaneEdge(destApproach, outboundLane) {
  if (outboundLane.centerX !== undefined) {
    if (destApproach === 'N') {
      return { x: outboundLane.centerX, y: INTERSECTION_N };
    }
    return { x: outboundLane.centerX, y: INTERSECTION_S };
  }
  if (destApproach === 'E') {
    return { x: INTERSECTION_E, y: outboundLane.centerY };
  }
  return { x: INTERSECTION_W, y: outboundLane.centerY };
}

/** On outbound left lane centerline just past the intersection box. */
function outboundLeftLaneEnd(destApproach, outboundLane) {
  const pad = LW_OUT * 1.5;
  if (outboundLane.centerX !== undefined) {
    if (destApproach === 'N') {
      return { x: outboundLane.centerX, y: INTERSECTION_N - pad };
    }
    return { x: outboundLane.centerX, y: INTERSECTION_S + pad };
  }
  if (destApproach === 'E') {
    return { x: INTERSECTION_E + pad, y: outboundLane.centerY };
  }
  return { x: INTERSECTION_W - pad, y: outboundLane.centerY };
}

/** Inside curb apex for a driver-right turn (inset from intersection box corner). */
function rightTurnCornerPoint(fromApproach) {
  const d = LW_IN * 1.4;
  switch (fromApproach) {
    case 'N':
      return { x: INTERSECTION_W + d, y: INTERSECTION_N + d };
    case 'S':
      return { x: INTERSECTION_E - d, y: INTERSECTION_S - d };
    case 'E':
      return { x: INTERSECTION_E - d, y: INTERSECTION_N + d };
    case 'W':
      return { x: INTERSECTION_W + d, y: INTERSECTION_S - d };
    default:
      throw new Error(`Unknown approach: ${fromApproach}`);
  }
}

/** Outbound lanes allowed for right-turn exits (all approaches). */
function outboundLanesForRightTurnExit(destApproach) {
  const group = APPROACH_LANE_GROUPS.find((g) => g.approach === destApproach);
  const geomLeftmostId = findOutboundLeftmostLane(destApproach).id;
  return group.outbound.filter(
    (lane) => lane.id !== geomLeftmostId && lane.type !== 'left',
  );
}

/** Driver-rightmost lane among a subset (merge toward the outside of the turn). */
function pickRightmostAmongLanes(lanes, destApproach) {
  const out = outboundTravelForward(destApproach);
  const right = { x: -out.y, y: out.x };
  return lanes.reduce((best, lane) => {
    const score = (lane.centerX ?? CX) * right.x + (lane.centerY ?? CY) * right.y;
    const bestScore = (best.centerX ?? CX) * right.x + (best.centerY ?? CY) * right.y;
    return score > bestScore ? lane : best;
  });
}

/** Right-turn exit: outermost allowed outbound track (avoids sweeping the leftmost lane). */
function pickOutboundLaneForRightTurn(destApproach) {
  const group = APPROACH_LANE_GROUPS.find((g) => g.approach === destApproach);
  const candidates = outboundLanesForRightTurnExit(destApproach);
  if (candidates.length === 0) {
    return group.outbound.find((lane) => lane.type !== 'left') ?? group.outbound[0];
  }
  return pickRightmostAmongLanes(candidates, destApproach);
}

/**
 * Left-turn cubic: inbound lane → center, curve into outbound left lane, straight along that centerline.
 * @param {{ approach: string, type: string, centerX?: number, centerY?: number, stopLineX?: number, stopLineY?: number }} inboundLane
 */
export function buildLeftTurnPathForLane(inboundLane) {
  const destApproach = leftTurnDestinationApproach(inboundLane.approach);
  const outboundLane = findOutboundLeftTurnLane(destApproach);
  const p0 = getInboundStopCenter(inboundLane);
  const p1 =
    inboundLane.centerX !== undefined
      ? { x: inboundLane.centerX, y: CY }
      : { x: CX, y: inboundLane.centerY };
  const p2 = outboundLeftLaneEdge(destApproach, outboundLane);
  const p3 = outboundLeftLaneEnd(destApproach, outboundLane);
  return { p0, p1, p2, p3 };
}

/**
 * Right-turn cubic: short inbound lead-in → inside corner → outbound centerline.
 * Exit lane is whichever outbound track is closest to the apex (visual merge, not label).
 * S→E, E→N, N→W, W→S.
 * @param {{ approach: string, type: string, centerX?: number, centerY?: number, stopLineX?: number, stopLineY?: number }} inboundLane
 */
export function buildRightTurnPathForLane(inboundLane) {
  const destApproach = rightTurnDestinationApproach(inboundLane.approach);
  const corner = rightTurnCornerPoint(inboundLane.approach);
  const outboundLane = pickOutboundLaneForRightTurn(destApproach);
  const p0 = getInboundStopCenter(inboundLane);
  const p1 = corner;
  const p2 = outboundLeftLaneEdge(destApproach, outboundLane);
  const p3 = outboundLeftLaneEnd(destApproach, outboundLane);
  return { p0, p1, p2, p3 };
}

/** @param {string} waypointKey */
export function getBezierPath(waypointKey) {
  const path = waypoints[waypointKey];
  if (!path) throw new Error(`Unknown waypoint path: ${waypointKey}`);
  return path;
}

/**
 * Straight path along this lane's centerline (each straight lane has its own corridor).
 * @param {{ approach: string, centerX?: number, centerY?: number, stopLineX?: number, stopLineY?: number }} lane
 */
export function buildStraightPathForLane(lane) {
  const stop = getInboundStopCenter(lane);
  if (lane.centerX !== undefined) {
    const exitY = lane.approach === 'N' ? INTERSECTION_S : INTERSECTION_N;
    return {
      p0: { x: lane.centerX, y: stop.y },
      p1: { x: lane.centerX, y: CY },
      p2: { x: lane.centerX, y: exitY },
    };
  }
  const exitX = lane.approach === 'E' ? INTERSECTION_W : INTERSECTION_E;
  return {
    p0: { x: stop.x, y: lane.centerY },
    p1: { x: CX, y: lane.centerY },
    p2: { x: exitX, y: lane.centerY },
  };
}

/**
 * Crossing path for a vehicle (per-lane straight, shared template for turns).
 * @param {{ approach: string, movementType: string, laneType?: string }} car
 * @param {{ approach: string, type: string, centerX?: number, centerY?: number } | null} lane
 */
export function getPathForCar(car, lane) {
  if (car.laneType === 'straight' && lane) {
    return buildStraightPathForLane(lane);
  }
  if (car.laneType === 'right' && lane) {
    return buildRightTurnPathForLane(lane);
  }
  if (car.movementType === 'left' && lane) {
    return buildLeftTurnPathForLane(lane);
  }
  return getBezierPath(getWaypointKey(car));
}

/** True when point is outside the intersection box (optionally inflated). */
export function isOutsideIntersection(x, y, margin = 0) {
  const r = getIntersectionInnerRect();
  return (
    x < r.x0 - margin ||
    x > r.x1 + margin ||
    y < r.y0 - margin ||
    y > r.y1 + margin
  );
}

/** Which zone id contains a world point (inside intersection only). */
export function zoneIdAtPoint(x, y) {
  const r = getIntersectionInnerRect();
  if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return null;
  if (x < CX) return y < CY ? 'NW' : 'SW';
  return y < CY ? 'NE' : 'SE';
}

/** Zone ids a crossing path crosses (sampled). */
export function zonesAlongPath(path) {
  const zones = new Set();
  for (let i = 0; i <= 8; i++) {
    const pt = evalPath(path, i / 8);
    const z = zoneIdAtPoint(pt.x, pt.y);
    if (z) zones.add(z);
  }
  return [...zones];
}

/** @deprecated Use zonesAlongPath */
export function zonesAlongBezier(b) {
  return zonesAlongPath(b);
}

export function getMedianStripRects() {
  return [
    { x: MED_X0, y: 0, w: MED, h: INTERSECTION_N },
    { x: MED_X0, y: INTERSECTION_S, w: MED, h: W - INTERSECTION_S },
    { x: 0, y: MED_Y0, w: INTERSECTION_W, h: MED },
    { x: INTERSECTION_E, y: MED_Y0, w: W - INTERSECTION_E, h: MED },
  ];
}

export function getStopLineSegments() {
  return [
    { approach: 'N', x1: VX0, y1: STOP_N, x2: MED_X0, y2: STOP_N },
    { approach: 'S', x1: INB_X0, y1: STOP_S, x2: INB_X1, y2: STOP_S },
    { approach: 'W', x1: STOP_W, y1: MED_Y1, x2: STOP_W, y2: INB_Y1 },
    { approach: 'E', x1: STOP_E, y1: HY0, x2: STOP_E, y2: MED_Y0 },
  ];
}

function addVerticalInternalBoundariesClipped(lines, x0, x1, yMin, yMax, laneWidth, anchorX, dir) {
  let x = anchorX + dir * laneWidth;
  while (dir < 0 ? x > x0 + 0.001 : x < x1 - 0.001) {
    lines.push({ x1: x, y1: yMin, x2: x, y2: yMax });
    x += dir * laneWidth;
  }
}

function addHorizontalInternalBoundariesClipped(lines, y0, y1, xMin, xMax, laneWidth, anchorY, dir) {
  let y = anchorY + dir * laneWidth;
  while (dir < 0 ? y > y0 + 0.001 : y < y1 - 0.001) {
    lines.push({ x1: xMin, y1: y, x2: xMax, y2: y });
    y += dir * laneWidth;
  }
}

export function getLaneBoundaryPolylines() {
  const lines = [];
  // Inbound / outbound dashed lines end at stop line (not through crosswalk).
  addVerticalInternalBoundariesClipped(lines, VX0, MED_X0, 0, STOP_N, LW_IN_EQUAL, VX0, 1);
  addVerticalInternalBoundariesClipped(
    lines,
    MED_X0 - BLOCK_OUT,
    MED_X0 - OUT_CLEAR,
    STOP_S,
    W,
    LW_OUT,
    MED_X0 - OUT_CLEAR,
    -1
  );
  addVerticalInternalBoundariesClipped(lines, INB_X0, INB_X1, STOP_S, W, LW_IN_EQUAL, INB_X0, 1);
  addVerticalInternalBoundariesClipped(
    lines,
    MED_X1 + OUT_CLEAR,
    MED_X1 + BLOCK_OUT,
    0,
    STOP_N,
    LW_OUT,
    MED_X1 + OUT_CLEAR,
    1
  );
  addHorizontalInternalBoundariesClipped(lines, HY0, MED_Y0, STOP_E, W, LW_IN_EQUAL, HY0, 1);
  addHorizontalInternalBoundariesClipped(
    lines,
    MED_Y0 - BLOCK_OUT,
    MED_Y0 - OUT_CLEAR,
    0,
    STOP_W,
    LW_OUT,
    MED_Y0 - OUT_CLEAR,
    -1
  );
  addHorizontalInternalBoundariesClipped(lines, MED_Y1, INB_Y1, 0, STOP_W, LW_IN_EQUAL, MED_Y1, 1);
  addHorizontalInternalBoundariesClipped(
    lines,
    MED_Y1 + OUT_CLEAR,
    MED_Y1 + BLOCK_OUT,
    STOP_E,
    W,
    LW_OUT,
    MED_Y1 + OUT_CLEAR,
    1
  );
  return lines;
}

/** World-space offset so a left/right turn glyph centroid sits on the lane center. */
function turnArrowGlyphOffset(arrow, angle) {
  const len = MARKING.ARROW_SHAFT;
  const s = len / 25;
  const bend = 2 * s;
  const headY = 13 * s;
  const headW = 5 * s;
  const lx = (-len / 2 + bend + headW) / 2;
  const ly = arrow === 'left' ? -headY / 2 : headY / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    dx: lx * cos - ly * sin,
    dy: lx * sin + ly * cos,
  };
}

/**
 * Pavement arrows for inbound lanes (before stop, not in intersection box).
 * @returns {Array<{ x: number, y: number, angle: number, arrow: 'left'|'straight'|'right', approach: string }>}
 */
export function getInboundLaneArrowSpecs() {
  const d = MARKING.ARROW_FROM_STOP;
  const specs = [];
  for (let g = 0; g < APPROACH_LANE_GROUPS.length; g++) {
    const group = APPROACH_LANE_GROUPS[g];
    const ap = group.approach;
    let angle;
    for (let i = 0; i < group.inbound.length; i++) {
      const lane = group.inbound[i];
      const t = lane.type;
      const arrow = t === 'straight' ? 'straight' : t;
      let x;
      let y;
      if (ap === 'N') {
        x = lane.centerX;
        y = STOP_N - d;
        angle = Math.atan2(FWD.N.y, FWD.N.x);
      } else if (ap === 'S') {
        x = lane.centerX;
        y = STOP_S + d;
        angle = Math.atan2(FWD.S.y, FWD.S.x);
      } else if (ap === 'W') {
        x = STOP_W - d;
        y = lane.centerY;
        angle = Math.atan2(FWD.W.y, FWD.W.x);
      } else {
        x = STOP_E + d;
        y = lane.centerY;
        angle = Math.atan2(FWD.E.y, FWD.E.x);
      }
      if (arrow === 'left' || arrow === 'right') {
        const off = turnArrowGlyphOffset(arrow, angle);
        if (ap === 'N' || ap === 'S') {
          x -= off.dx;
        } else {
          y -= off.dy;
        }
      }
      specs.push({ x, y, angle, arrow, approach: ap });
    }
  }
  return specs;
}
