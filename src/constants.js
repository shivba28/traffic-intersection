// All numeric and shared visual tokens — single source of truth (architecture §20).

export const WORLD = {
  SIZE: 800,
  CENTER: 400,
  DESPAWN_MARGIN: 40,
};

function buildRoadConstants() {
  const LANE_WIDTH = 14;
  const OUTBOUND_LANE_WIDTH = 18;
  const OUTBOUND_MEDIAN_CLEARANCE = 3;
  const LANES_PER_DIRECTION = 4;
  const MEDIAN_WIDTH = 4;
  const inboundSpan = LANES_PER_DIRECTION * LANE_WIDTH;
  const outboundSpan =
    OUTBOUND_MEDIAN_CLEARANCE + LANES_PER_DIRECTION * OUTBOUND_LANE_WIDTH;
  const blockSide = Math.max(inboundSpan, outboundSpan);
  return {
    LANE_WIDTH,
    OUTBOUND_LANE_WIDTH,
    OUTBOUND_MEDIAN_CLEARANCE,
    LANES_PER_DIRECTION,
    MEDIAN_WIDTH,
    BLOCK_SIDE: blockSide,
    TOTAL_WIDTH: 2 * blockSide + MEDIAN_WIDTH,
  };
}

/** Per direction: outbound | median | inbound (each side = LANES_PER_DIRECTION lanes). */
export const ROAD = buildRoadConstants();

export const CAR = {
  LENGTH: 18,
  WIDTH: 10,
  MAX_SPEED: 90,
  /** Ramp-up on straight/right crossing (matches inbound decel feel). */
  CROSSING_ACCEL: 140,
  /** Arc length over which the car eases onto the crossing path (no position snap). */
  CROSSING_PATH_BLEND_DIST: 18,
  CROSSING_SPEED_T: 0.4,
  /** Min path-t lead before the next same-lane car may enter (~one car length + gap). */
  CROSSING_ENTRY_STAGGER_T: 0.1,
  /** Release left-turn slot this far along the path (slightly before stagger). */
  CROSSING_SLOT_RELEASE_T: 0.06,
  /** Bumper clearance in inbound queues. */
  FOLLOW_GAP: 3,
  /** Tighter bumper clearance while crossing / exiting the intersection. */
  CROSSING_FOLLOW_GAP: 1,
  EXIT_TIMEOUT: 8,
  /** Extra setback before stop line (bumper stays clear of white bar). */
  STOP_BACKUP: 6,
  /** Distance over which speed eases down before the stop target. */
  STOP_DECEL_ZONE: 28,
  /** Snap cleanly to stop target within this distance (no oscillation). */
  STOP_SETTLE_EPSILON: 0.75,
};

/** Phase timing — single source for signal cycle durations (Step 5). */
export const PHASE = {
  YELLOW_DURATION: 3,
  ALL_RED_DURATION: 2,
  MIN_GREEN_STRAIGHT: 9,
  MAX_GREEN_STRAIGHT: 10,
  MIN_GREEN_LEFT: 8,
  MAX_GREEN_LEFT: 20,
};

/** Main signal lamp states (avoid magic strings in controller / consumers). */
export const MAIN_SIGNAL = {
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red',
};

/** Protected left-turn arrow states. */
export const LEFT_ARROW = {
  GREEN: 'green',
  OFF: 'off',
};

/** Approaches grouped by conflicting axis (only one axis main-green at a time). */
export const SIGNAL_AXIS = {
  NS: ['N', 'S'],
  EW: ['E', 'W'],
};

export const SPAWN = {
  INTERVAL: 0.3,
  MAX_CARS: 50,
  MAX_PER_LANE: 10,
  /** Dev focus: only spawn on inbound right-turn lanes (all approaches). */
  RIGHT_LANE_ONLY: false,
};

function buildSignalConstants() {
  const LIGHT_RADIUS = 5;
  const HEAD_PADDING = 5;
  const HEAD_SPACING = 5;
  const LAMP_COUNT = 4;
  const BULB_DIAMETER = LIGHT_RADIUS * 2;
  const HEAD_HEIGHT =
    HEAD_PADDING * 2 + LAMP_COUNT * BULB_DIAMETER + (LAMP_COUNT - 1) * HEAD_SPACING;
  const HEAD_WIDTH = HEAD_PADDING * 2 + BULB_DIAMETER;
  return {
    LIGHT_RADIUS,
    HEAD_PADDING,
    HEAD_SPACING,
    LAMP_COUNT,
    BULB_DIAMETER,
    HEAD_HEIGHT,
    HEAD_WIDTH,
    /** Inner face of housing to intersection box edge (all approaches). */
    INTERSECTION_INSET: 10,
    /** @deprecated Use INTERSECTION_INSET */
    POLE_SETBACK: 10,
    /** Left-turn lamp arrow shape metrics. */
    ARROW_SCALE: 1,
  };
}

export const SIGNAL = buildSignalConstants();

export const HUD = {
  FONT: '12px monospace',
  FONT_LABEL: '11px monospace',
  PADDING: 12,
  LINE_HEIGHT: 18,
  BAR_WIDTH: 100,
};

/** Loop / timing */
export const LOOP = {
  MAX_DELTA: 1 / 30,
};

/** Static scene rendering (no duplicate literals in renderer) */
export const COLORS = {
  BACKGROUND: '#2a4a2a',
  ASPHALT: '#3d3d3d',
  LANE_LINE: '#d0d0d0',
  STOP_LINE: '#ffffff',
  /** Raised median between opposing directions */
  MEDIAN: '#6a5a28',
  MEDIAN_EDGE: '#8a7a40',
  SIGNAL_OFF: '#1e1e1e',
  SIGNAL_RED: '#c0392b',
  SIGNAL_YELLOW: '#c9a227',
  SIGNAL_GREEN: '#3d8b5a',
  SIGNAL_HOUSING: '#2a2a2a',
  SIGNAL_HOUSING_STROKE: '#444444',
  /** Protected left-turn arrow glyph fill colors. */
  SIGNAL_LEFT_ARROW_ON: '#7ee08a',
  SIGNAL_LEFT_ARROW_OFF: '#3a4a3f',
  /** Deterministic car body palette (muted, non-neon) */
  CAR: [
    '#8b3a3a',
    '#4a5568',
    '#5c6b73',
    '#3d4f5f',
    '#6b5b4f',
    '#4a5d4a',
    '#5a4a6a',
    '#6a5a48',
  ],
};

export const MARKING = {
  DASH_LENGTH: 12,
  DASH_GAP: 10,
  LANE_LINE_WIDTH: 1,
  STOP_LINE_WIDTH: 4,
  EDGE_LINE_WIDTH: 2,
  /** Inbound pavement arrows: stroke-only, before stop line */
  ARROW_STROKE: 1,
  ARROW_SHAFT: 7,
  ARROW_HEAD: 3.5,
  ARROW_FROM_STOP: 16,
};
