import { GameState } from '../game/state';
import { Matrix, identity } from '../math/matrix';
import { RotationState, getRotationPlanes, buildRotationMatrix } from '../math/projection';
import { renderGrid } from './grid';
import { renderSnake, renderFood } from './snake';
import { renderHUD, renderStartScreen, renderGameOver, renderTransition } from './hud';
import { ROTATION_SPEEDS, BG_COLOR } from '../config';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvasSize: number;
  private rotationState: RotationState;
  private rotMatrix: Matrix;
  private frame: number = 0;
  private isInputActive: boolean = false;
  private inputCooldown: number = 0;

  constructor(ctx: CanvasRenderingContext2D, canvasSize: number) {
    this.ctx = ctx;
    this.canvasSize = canvasSize;
    this.rotationState = { angles: [], planes: [] };
    this.rotMatrix = identity(2);
  }

  setInputActive() {
    this.isInputActive = true;
    this.inputCooldown = 30; // slow rotation for 30 frames after input
  }

  updateRotation(dims: number) {
    const planes = getRotationPlanes(dims);
    const speeds = ROTATION_SPEEDS[dims] || [];

    // Reinitialize if dimension changed
    if (this.rotationState.planes.length !== planes.length) {
      this.rotationState = {
        planes,
        angles: new Array(planes.length).fill(0),
      };
    }

    // Update angles
    const dampFactor = this.inputCooldown > 0 ? 0.2 : 1.0;
    if (this.inputCooldown > 0) this.inputCooldown--;

    for (let i = 0; i < this.rotationState.angles.length; i++) {
      this.rotationState.angles[i] += (speeds[i] || 0.1) * 0.016 * dampFactor;
    }

    if (dims >= 3) {
      this.rotMatrix = buildRotationMatrix(dims, this.rotationState);
    } else {
      this.rotMatrix = identity(dims);
    }
  }

  render(state: GameState) {
    this.frame++;
    const ctx = this.ctx;
    const size = this.canvasSize;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, size, size);

    if (state.status === 'start') {
      renderStartScreen(ctx, size);
      return;
    }

    // Update rotation
    this.updateRotation(state.dims);

    // Render game elements
    renderGrid(ctx, state.dims, state.gridSize, this.rotMatrix, size, state.snake[0]);
    renderFood(ctx, state.food, state.dims, this.rotMatrix, state.gridSize, size, this.frame);
    renderSnake(ctx, state.snake, state.dims, this.rotMatrix, state.gridSize, size);
    renderHUD(ctx, state, size);

    // Overlays
    if (state.status === 'gameover') {
      renderGameOver(ctx, state, size);
    } else if (state.status === 'transitioning') {
      renderTransition(ctx, state, size, state.transitionTimer);
    } else if (state.status === 'paused') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', size / 2, size / 2);
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('Press SPACE to resume', size / 2, size / 2 + 30);
    }
  }
}
