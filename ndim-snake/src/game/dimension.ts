import { Vec, vecUnit } from '../math/vector';
import { GameState, spawnFood } from './state';
import { GRID_SIZES } from '../config';

export function transitionDimension(state: GameState): GameState {
  const newDims = state.dims + 1;
  const newGridSize = GRID_SIZES[newDims];

  // Extend all snake coordinates with 0 in the new dimension
  // Also remap coords to fit the new grid size
  const newSnake = state.snake.map(coord => {
    const newCoord = coord.map((c, i) => {
      const oldSize = state.gridSize;
      // Remap to center of new grid
      const ratio = c / oldSize;
      return Math.floor(ratio * newGridSize);
    });
    newCoord.push(Math.floor(newGridSize / 2)); // center in new dimension
    return newCoord;
  });

  // Direction extends with 0
  const newDirection = [...state.direction, 0];

  const newFood = spawnFood(newDims, newGridSize, newSnake);

  return {
    ...state,
    dims: newDims,
    gridSize: newGridSize,
    snake: newSnake,
    direction: newDirection,
    food: newFood,
    status: 'playing',
    transitionTimer: 0,
  };
}
