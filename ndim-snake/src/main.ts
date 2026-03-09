import { createInitialState, GameState } from './game/state';
import { moveSnake } from './game/snake';
import { getDirectionFromKey } from './game/input';
import { transitionDimension } from './game/dimension';
import { setupTouchControls, createDimensionButtons } from './game/touch';
import { Renderer } from './render/renderer';
import { TICK_MS, CANVAS_SIZE } from './config';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const container = document.getElementById('game-container')!;
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

const ctx = canvas.getContext('2d')!;
const renderer = new Renderer(ctx, CANVAS_SIZE);

let state: GameState = createInitialState();
let lastTick = 0;
let pendingDirection: number[] | null = null;

function handleTap() {
  if (state.status === 'start') {
    state = { ...state, status: 'playing' };
  } else if (state.status === 'gameover') {
    state = createInitialState();
    state = { ...state, status: 'playing' };
  } else if (state.status === 'paused') {
    state = { ...state, status: 'playing' };
  }
}

function handleDirection(dir: number[]) {
  if (state.status !== 'playing') return;
  pendingDirection = dir;
  renderer.setInputActive();
}

// Keyboard input
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.status === 'playing') {
      state = { ...state, status: 'paused' };
    } else {
      handleTap();
    }
    return;
  }

  if (state.status !== 'playing') return;

  const newDir = getDirectionFromKey(e.code, state.dims, state.direction);
  if (newDir) {
    e.preventDefault();
    handleDirection(newDir);
  }
});

// Touch input
setupTouchControls(
  canvas,
  () => state.dims,
  () => state.direction,
  handleDirection,
  handleTap,
);

// On-screen dimension buttons (for axes beyond X/Y on mobile)
const dimButtons = createDimensionButtons(
  container,
  () => state.dims,
  () => state.direction,
  handleDirection,
);

function gameTick() {
  if (state.status === 'transitioning') {
    state = { ...state, transitionTimer: state.transitionTimer - 1 };
    if (state.transitionTimer <= 0) {
      state = transitionDimension(state);
      dimButtons.update(state.dims);
    }
    return;
  }

  if (state.status !== 'playing') return;

  if (pendingDirection) {
    state = { ...state, direction: pendingDirection };
    pendingDirection = null;
  }

  state = moveSnake(state);
}

function gameLoop(timestamp: number) {
  if (timestamp - lastTick >= TICK_MS) {
    gameTick();
    lastTick = timestamp;
  }

  renderer.render(state);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
