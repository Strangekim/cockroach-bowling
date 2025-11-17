import type { GameState } from '../store/gameStateStore';

export interface ThrowResult {
  pinsDown: number;
  wallHits: number;
}

export function applyThrowResult(state: GameState, result: ThrowResult): void {
  if (state.gameOver) return;

  const frameIndex = state.frame - 1;
  const throwIndex = state.throwInFrame - 1;
  const frame = state.frames[frameIndex];

  frame.throws[throwIndex] = result.pinsDown;
  frame.pins[throwIndex] = result.pinsDown;
  frame.wallHits[throwIndex] = result.wallHits;

  const frameScore = frame.throws[0] + frame.throws[1];
  frame.score = frameScore;

  state.total = state.frames.reduce((sum, f) => sum + f.score, 0);

  if (state.throwInFrame === 1) {
    state.throwInFrame = 2;
  } else {
    state.throwInFrame = 1;
    state.frame += 1;
  }

  if (state.frame > state.frames.length) {
    state.gameOver = true;
  }
}

