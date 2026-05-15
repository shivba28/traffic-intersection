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
  /** Speed drop per frame above this turns brake lights on. */
  BRAKE_LIGHT_DECEL_EPS: 0.25,
  /** Turn-signal flash half-period (seconds). */
  TURN_SIGNAL_FLASH_PERIOD: 0.5,
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

/** Exclusive pedestrian phase (US-style); actual seconds chosen per cycle via sim.rng. */
export const PEDESTRIAN = {
  WALK_MIN: 6,
  WALK_MAX: 10,
  FLASH_DONT_WALK_MIN: 5,
  FLASH_DONT_WALK_MAX: 8,
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
  YELLOW: 'yellow',
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

/** Log inbound lane id + queue length each tick (carManager rebuild). */
export const DEBUG_LANE_QUEUES = false;

/** Log adaptive green phase id, elapsed time, and active demand each tick. */
export const DEBUG_ADAPTIVE_TIMING = false;

/** Log phase id on each phase transition. */
export const DEBUG_PHASE_TRANSITIONS = false;

function buildSignalConstants() {
  const LIGHT_RADIUS = 6;
  const HEAD_PADDING = 6;
  const INNER_GAP = 2.5;
  const LAMP_COUNT = 4;
  const BULB_DIAMETER = LIGHT_RADIUS * 2;
  /** Horizontal housing: R · Y · G · ← in a row (render layout only). */
  const HEAD_WIDTH =
    HEAD_PADDING * 2 + LAMP_COUNT * BULB_DIAMETER + (LAMP_COUNT - 1) * INNER_GAP;
  const HEAD_HEIGHT = HEAD_PADDING * 2 + BULB_DIAMETER;
  return {
    LIGHT_RADIUS,
    HEAD_PADDING,
    INNER_GAP,
    LAMP_COUNT,
    BULB_DIAMETER,
    HEAD_HEIGHT,
    HEAD_WIDTH,
    /** Sidewalk setback from intersection corner (render layout). */
    CORNER_OFFSET: 18,
    /** @deprecated Use CORNER_OFFSET */
    INTERSECTION_INSET: 18,
    POLE_SETBACK: 18,
    POST_W: 3,
    POST_H: 8,
    ARROW_SCALE: 1,
    LABEL_FONT: '600 10px ui-sans-serif, system-ui, sans-serif',
    /** Space below housing before travel-direction label. */
    LABEL_GAP: -25,
    /** Shift label along world axis from intersection center → signal (clears corner wait pads). */
    LABEL_OUTWARD_NUDGE: 12,
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

/** Canvas viewport navigation (visual only). */
export const VIEW = {
  /** Floor is computed at runtime from container vs canvas width (see renderer._getMinZoom). */
  MIN_ZOOM: 1,
  MAX_ZOOM: 4,
  ZOOM_WHEEL_SENSITIVITY: 0.0012,
  ROTATE_WHEEL_SENSITIVITY: 0.003,
};

/** Static scene rendering (no duplicate literals in renderer) */
export const COLORS = {
  BACKGROUND: '#F4F2EC',
  ASPHALT: '#2B2D31',
  LANE_LINE: '#ECE7DA',
  CENTER_LINE: '#E8B247',
  /** Center stripe of median divider (landscaped / tree strip). */
  MEDIAN_TREE: '#3A6B4A',
  STOP_LINE: '#ECE7DA',
  SIGNAL_OFF: '#26282C',
  SIGNAL_RED: '#DD4B3A',
  SIGNAL_YELLOW: '#F2B43A',
  SIGNAL_GREEN: '#2FA56B',
  SIGNAL_HOUSING: '#16181B',
  SIGNAL_HOUSING_STROKE: 'rgba(255,255,255,0.07)',
  SIGNAL_LEFT_ARROW_ON: '#0E1116',
  SIGNAL_LEFT_ARROW_OFF: '#3B3E45',
  SIGNAL_LABEL: '#54565B',
  /** Muted palette (design reference) */
  CAR: [
    '#7E8590',
    '#3A4252',
    '#6B8E7E',
    '#A4694B',
    '#B8A777',
    '#D2C9B6',
    '#4E5763',
  ],
};

export const MARKING = {
  DASH_LENGTH: 10,
  DASH_GAP: 9,
  LANE_LINE_WIDTH: 1.4,
  STOP_LINE_WIDTH: 3,
  EDGE_LINE_WIDTH: 2,
  CENTER_LINE_WIDTH: 1.7,
  CENTER_LINE_GAP: 3.2,
  CROSSWALK_SLAT_LEN: 18,
  CROSSWALK_LEAD: 2,
  /** Gap between crosswalk (far edge) and stop line. */
  STOP_LINE_CROSSWALK_GAP: 2,
  ARROW_STROKE: 1,
  ARROW_SHAFT: 10,
  ARROW_HEAD: 4,
  ARROW_FROM_STOP: 60,
};
