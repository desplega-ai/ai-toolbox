import { Vec, vecZero, vecUnit, vecKey } from '../math/vector';
import { GRID_SIZES } from '../config';

export type GameStatus = 'playing' | 'paused' | 'gameover' | 'transitioning' | 'start';

export interface GameState {
  dims: number;
  gridSize: number;
  snake: Vec[];
  direction: Vec;
  food: Vec;
  score: number;
  status: GameStatus;
  transitionTimer: number;
  foodEatenThisDim: number; // track food eaten in current dimension
}

export function createInitialState(): GameState {
  const dims = 2;
  const gridSize = GRID_SIZES[dims];
  const center = Math.floor(gridSize / 2);

  const head = vecZero(dims);
  head[0] = center;
  head[1] = center;

  const body1 = [...head];
  body1[0] = center - 1;

  const body2 = [...head];
  body2[0] = center - 2;

  const snake = [head, body1, body2];
  const direction = vecUnit(dims, 0, 1); // moving right

  const food = spawnFood(dims, gridSize, snake);

  return {
    dims,
    gridSize,
    snake,
    direction,
    food,
    score: 0,
    status: 'start',
    transitionTimer: 0,
    foodEatenThisDim: 0,
  };
}

export function spawnFood(dims: number, gridSize: number, snake: Vec[]): Vec {
  const occupied = new Set(snake.map(vecKey));
  let coord: Vec;
  let attempts = 0;
  do {
    coord = [];
    for (let i = 0; i < dims; i++) {
      coord.push(Math.floor(Math.random() * gridSize));
    }
    attempts++;
  } while (occupied.has(vecKey(coord)) && attempts < 1000);
  return coord;
}
