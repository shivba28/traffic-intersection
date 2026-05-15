/**
 * Coordinate conventions (architecture §2) — do not deviate.
 *
 * Dual carriageway: facing **toward** the intersection, cross-section reads
 *   [ inbound | median | outbound ]
 * (inbound on the side swapped from the earlier layout; still derived from WORLD.CENTER / ROAD.*).
 */

import { WORLD, ROAD, MARKING, CAR, SIGNAL } from './constants.js';

const { SIZE: W, CENTER: CX, CENTER: CY } = WORLD;

const LW = ROAD.LANE_WIDTH;
const LPD = ROAD.LANES_PER_DIRECTION;
const MED = ROAD.MEDIAN_WIDTH;
const TW = ROAD.TOTAL_WIDTH;
const HALF_ROAD = TW / 2;
const BLOCK = LPD * LW;

const VX0 = CX - HALF_ROAD;
const VX1 = CX + HALF_ROAD;
const MED_X0 = VX0 + BLOCK;
const MED_X1 = MED_X0 + MED;
const INB_X0 = MED_X1;
const INB_X1 = VX1;

const HY0 = CY - HALF_ROAD;
const HY1 = CY + HALF_ROAD;
const MED_Y0 = HY0 + BLOCK;
const MED_Y1 = MED_Y0 + MED;
const INB_Y0 = MED_Y1;
const INB_Y1 = HY1;

const STOP_OFFSET = BLOCK + MED / 2;

const STOP_N = CY - STOP_OFFSET;
const STOP_S = CY + STOP_OFFSET;
const STOP_W = CX - STOP_OFFSET;
const STOP_E = CX + STOP_OFFSET;

const LANE_TYPES = ['left', 'straight', 'straight', 'right'];

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

/** Vertical slab low-x … high-x: west block | median | east block. */
function inboundCenterX_N(index) {
  return MED_X0 - LW * (index + 0.5);
}

/** S inbound (east block): left at +x from median — centers increase. */
function inboundCenterX_S(index) {
  return INB_X0 + LW * (index + 0.5);
}

/** N outbound (east block). */
function outboundCenterX_N(index) {
  return INB_X0 + LW * (index + 0.5);
}

/** S outbound (west block). */
function outboundCenterX_S(index) {
  return VX0 + LW * (index + 0.5);
}

/** W inbound (north / high-y block). */
function inboundCenterY_W(index) {
  return MED_Y1 + LW * (index + 0.5);
}

/** W outbound (south / low-y block). */
function outboundCenterY_W(index) {
  return HY0 + LW * (index + 0.5);
}

/** E inbound (south / low-y block). */
function inboundCenterY_E(index) {
  return HY0 + LW * (index + 0.5);
}

/** E outbound (north / high-y block). */
function outboundCenterY_E(index) {
  return MED_Y1 + LW * (index + 0.5);
}

/**
 * @param {'inbound'|'outbound'} role
 * @param {'N'|'S'} approach
 * @param {number} index 0..3
 */
function makeVerticalLane(role, approach, index) {
  const type = LANE_TYPES[index];
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
  const type = LANE_TYPES[index];
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

const N_LEFT = {
  p0: { x: lx, y: STOP_N - P0_APPROACH_OFFSET },
  p1: { x: lx, y: CY },
  p2: { x: STOP_W - LW, y: HY0 + 1.5 * LW },
};

const N_STRAIGHT = {
  p0: { x: straightMidX, y: STOP_N },
  p1: { x: straightMidX, y: CY },
  p2: { x: straightMidX, y: STOP_S },
};

const N_RIGHT = {
  p0: { x: rx, y: STOP_N - P0_APPROACH_OFFSET },
  p1: { x: STOP_E - 2 * LW, y: CY },
  p2: { x: STOP_E, y: HY0 + 2.5 * LW },
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

/** Y positions of lamp centers inside housing (local coords, origin at housing center). */
export function getSignalLampOffsets() {
  const r = SIGNAL.LIGHT_RADIUS;
  const step = SIGNAL.BULB_DIAMETER + SIGNAL.HEAD_SPACING;
  const first = -SIGNAL.HEAD_HEIGHT / 2 + SIGNAL.HEAD_PADDING + r;
  return [first, first + step, first + step * 2, first + step * 3];
}

/** Signal heads on outbound side (no dashed lane lines), near each stop line. */
export function getSignalHeadLayouts() {
  const gap = SIGNAL.POLE_SETBACK;
  const halfH = SIGNAL.HEAD_HEIGHT / 2;
  const halfW = SIGNAL.HEAD_WIDTH / 2;
  const layouts = [];

  const nOut = outboundBlockCenter('N');
  layouts.push({
    approach: 'N',
    x: nOut.x,
    y: STOP_N - gap - halfH,
    facingHeading: getSignalFacingHeading('N'),
    laneCenterX: nOut.x,
  });

  const sOut = outboundBlockCenter('S');
  layouts.push({
    approach: 'S',
    x: sOut.x,
    y: STOP_S + gap + halfH,
    facingHeading: getSignalFacingHeading('S'),
    laneCenterX: sOut.x,
  });

  const wOut = outboundBlockCenter('W');
  layouts.push({
    approach: 'W',
    x: STOP_W - gap - halfW,
    y: wOut.y,
    facingHeading: getSignalFacingHeading('W'),
    laneCenterY: wOut.y,
  });

  const eOut = outboundBlockCenter('E');
  layouts.push({
    approach: 'E',
    x: STOP_E + gap + halfW,
    y: eOut.y,
    facingHeading: getSignalFacingHeading('E'),
    laneCenterY: eOut.y,
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
    x0: STOP_W,
    y0: STOP_N,
    x1: STOP_E,
    y1: STOP_S,
  };
}

export function getMedianStripRects() {
  return [
    { x: MED_X0, y: 0, w: MED, h: STOP_N },
    { x: MED_X0, y: STOP_S, w: MED, h: W - STOP_S },
    { x: 0, y: MED_Y0, w: STOP_W, h: MED },
    { x: STOP_E, y: MED_Y0, w: W - STOP_E, h: MED },
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

function addVerticalInternalBoundariesClipped(lines, x0, x1, yMin, yMax) {
  let x = x0 + LW;
  while (x < x1 - 0.001) {
    lines.push({ x1: x, y1: yMin, x2: x, y2: yMax });
    x += LW;
  }
}

function addHorizontalInternalBoundariesClipped(lines, y0, y1, xMin, xMax) {
  let y = y0 + LW;
  while (y < y1 - 0.001) {
    lines.push({ x1: xMin, y1: y, x2: xMax, y2: y });
    y += LW;
  }
}

export function getLaneBoundaryPolylines() {
  const lines = [];
  addVerticalInternalBoundariesClipped(lines, VX0, MED_X0, 0, STOP_N);
  addVerticalInternalBoundariesClipped(lines, INB_X0, INB_X1, STOP_S, W);
  addHorizontalInternalBoundariesClipped(lines, MED_Y1, INB_Y1, 0, STOP_W);
  addHorizontalInternalBoundariesClipped(lines, HY0, MED_Y0, STOP_E, W);
  return lines;
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
      specs.push({ x, y, angle, arrow, approach: ap });
    }
  }
  return specs;
}
