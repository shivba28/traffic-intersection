// All numeric and shared visual tokens — single source of truth (architecture §20).

export const WORLD = {
  SIZE: 800,
  CENTER: 400,
  DESPAWN_MARGIN: 40,
};

function buildRoadConstants() {
  const LANE_WIDTH = 14;
  const LANES_PER_DIRECTION = 4;
  const MEDIAN_WIDTH = 4;
  return {
    LANE_WIDTH,
    LANES_PER_DIRECTION,
    MEDIAN_WIDTH,
    TOTAL_WIDTH: 2 * LANES_PER_DIRECTION * LANE_WIDTH + MEDIAN_WIDTH,
  };
}

/** Per direction: outbound | median | inbound (each side = LANES_PER_DIRECTION lanes). */
export const ROAD = buildRoadConstants();

export const CAR = {
  LENGTH: 18,
  WIDTH: 10,
  MAX_SPEED: 90,
  CROSSING_SPEED_T: 0.4,
  FOLLOW_GAP: 6,
  EXIT_TIMEOUT: 8,
  /** Extra setback before stop line (bumper stays clear of white bar). */
  STOP_BACKUP: 6,
  /** Distance over which speed eases down before the stop target. */
  STOP_DECEL_ZONE: 28,
  /** Snap cleanly to stop target within this distance (no oscillation). */
  STOP_SETTLE_EPSILON: 0.75,
};

export const PHASE = {
  YELLOW_DURATION: 3,
  ALL_RED_DURATION: 2,
  MIN_GREEN_STRAIGHT: 15,
  MAX_GREEN_STRAIGHT: 40,
  MIN_GREEN_LEFT: 8,
  MAX_GREEN_LEFT: 20,
};

export const SPAWN = {
  INTERVAL: 2.5,
  MAX_CARS: 20,
  MAX_PER_LANE: 4,
};

function buildSignalConstants() {
  const LIGHT_RADIUS = 4;
  const HEAD_PADDING = 4;
  const HEAD_SPACING = 4;
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
    /** Distance past the far-side stop line to the housing center. */
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
