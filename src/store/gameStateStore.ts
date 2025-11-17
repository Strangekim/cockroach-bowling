export interface FrameState {
  throws: [number, number];
  pins: [number, number];
  wallHits: [number, number];
  score: number;
}

export interface GameState {
  frame: number;
  throwInFrame: number;
  total: number;
  frames: FrameState[];
  currentThrowId: number;
  wallHitsThisThrow: number;
  gameOver: boolean;
}

export const createInitialGameState = (): GameState => ({
  frame: 1,
  throwInFrame: 1,
  total: 0,
  frames: Array.from({ length: 3 }, () => ({
    throws: [0, 0],
    pins: [0, 0],
    wallHits: [0, 0],
    score: 0,
  })),
  currentThrowId: 0,
  wallHitsThisThrow: 0,
  gameOver: false,
});

export const gameState: GameState = createInitialGameState();

export function resetGameState() {
  const next = createInitialGameState();
  Object.assign(gameState, next);
}

