import { Vec, vecAdd, vecEquals, vecKey, vecClone } from '../math/vector';
import { GameState, spawnFood } from './state';
import { GRID_SIZES } from '../config';

export type CollisionResult = 'none' | 'wall' | 'self' | 'food';

export function checkCollision(head: Vec, state: GameState): CollisionResult {
  // Wall check
  for (let i = 0; i < head.length; i++) {
    if (head[i] < 0 || head[i] >= state.gridSize) return 'wall';
  }

  // Food check
  if (vecEquals(head, state.food)) return 'food';

  // Self check (skip the tail since it will move)
  for (let i = 0; i < state.snake.length - 1; i++) {
    if (vecEquals(head, state.snake[i])) return 'self';
  }

  return 'none';
}

export function moveSnake(state: GameState): GameState {
  const newHead = vecAdd(state.snake[0], state.direction);
  const collision = checkCollision(newHead, state);

  if (collision === 'wall' || collision === 'self') {
    return { ...state, status: 'gameover' };
  }

  const newSnake = [newHead, ...state.snake];

  if (collision === 'food') {
    const newScore = state.score + 1;
    const newFoodEaten = state.foodEatenThisDim + 1;
    const shouldTransition = state.dims < 6 && newFoodEaten >= 3;

    if (shouldTransition) {
      return {
        ...state,
        snake: newSnake,
        score: newScore,
        status: 'transitioning',
        transitionTimer: 60, // frames
        foodEatenThisDim: 0,
      };
    }

    const newFood = spawnFood(state.dims, state.gridSize, newSnake);
    return {
      ...state,
      snake: newSnake,
      food: newFood,
      score: newScore,
      foodEatenThisDim: newFoodEaten,
    };
  }

  // Normal move — remove tail
  newSnake.pop();
  return { ...state, snake: newSnake };
}
