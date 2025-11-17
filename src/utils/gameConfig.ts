export const GAME_CONFIG = {
  ROACH: {
    RADIUS: 0.3,
    MASS: 2.2,
  },
  PIN: {
    RADIUS: 0.24,
    MASS: 0.9,
  },
  LANE: {
    LENGTH: 26,
    WIDTH: 4.0,
    GUTTER_WIDTH: 0.3,
    FOUL_Z: -0.8,
  },
  PHYSICS: {
    GRAVITY: 12,
  },
  GAME: {
    SUCCESS_THRESHOLD: 3,
    STOP_VELOCITY_THRESHOLD: 0.01,
    FALL_THRESHOLD: -30,
    END_DELAY: 2000,
    DROP_DISTANCE: -Infinity,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;

