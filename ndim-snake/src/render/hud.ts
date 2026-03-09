import { getControlsDisplay } from '../game/input';
import { DIM_COLORS, DIM_NAMES } from '../config';
import { GameState } from '../game/state';

export function renderHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasSize: number,
) {
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;

  // Score
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${state.score}`, 15, 25);

  // Dimension indicator
  ctx.fillStyle = DIM_COLORS[state.dims - 1];
  ctx.fillText(`Dimension: ${state.dims}D`, 15, 45);

  // Food counter for dimension transition
  if (state.dims < 6) {
    ctx.fillStyle = '#888';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(`Food to next dim: ${3 - state.foodEatenThisDim}`, 15, 63);
  }

  // Controls
  const controls = getControlsDisplay(state.dims);
  ctx.fillStyle = '#666';
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < controls.length; i++) {
    ctx.fillStyle = DIM_COLORS[i];
    ctx.globalAlpha = 0.6;
    ctx.fillText(controls[i], canvasSize - 15, 25 + i * 18);
  }
  ctx.globalAlpha = 1.0;

  // Axis indicator
  renderAxisIndicator(ctx, state.dims, canvasSize);
}

function renderAxisIndicator(
  ctx: CanvasRenderingContext2D,
  dims: number,
  canvasSize: number,
) {
  const ox = canvasSize - 50;
  const oy = canvasSize - 50;
  const len = 25;

  ctx.font = '10px "Courier New", monospace';
  ctx.textAlign = 'center';

  for (let i = 0; i < Math.min(dims, 3); i++) {
    ctx.strokeStyle = DIM_COLORS[i];
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;

    const angle = (i * Math.PI * 2) / 3 - Math.PI / 2;
    const ex = ox + Math.cos(angle) * len;
    const ey = oy + Math.sin(angle) * len;

    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = DIM_COLORS[i];
    ctx.fillText(DIM_NAMES[i], ex + Math.cos(angle) * 10, ey + Math.sin(angle) * 10);
  }

  ctx.globalAlpha = 1.0;
}

export function renderStartScreen(ctx: CanvasRenderingContext2D, canvasSize: number) {
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N-DIMENSIONAL', canvasSize / 2, canvasSize / 2 - 50);
  ctx.fillText('SNAKE', canvasSize / 2, canvasSize / 2 - 10);

  ctx.fillStyle = '#888';
  ctx.font = '16px "Courier New", monospace';
  ctx.fillText('Press SPACE to start', canvasSize / 2, canvasSize / 2 + 40);

  ctx.fillStyle = '#666';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillText('Eat 3 food to unlock a new dimension', canvasSize / 2, canvasSize / 2 + 70);
  ctx.fillText('Up to 6D!', canvasSize / 2, canvasSize / 2 + 90);
}

export function renderGameOver(ctx: CanvasRenderingContext2D, state: GameState, canvasSize: number) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  ctx.fillStyle = '#FF4444';
  ctx.font = 'bold 36px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', canvasSize / 2, canvasSize / 2 - 30);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '20px "Courier New", monospace';
  ctx.fillText(`Score: ${state.score}`, canvasSize / 2, canvasSize / 2 + 10);
  ctx.fillText(`Reached: ${state.dims}D`, canvasSize / 2, canvasSize / 2 + 35);

  ctx.fillStyle = '#888';
  ctx.font = '14px "Courier New", monospace';
  ctx.fillText('Press SPACE to restart', canvasSize / 2, canvasSize / 2 + 70);
}

export function renderTransition(ctx: CanvasRenderingContext2D, state: GameState, canvasSize: number, timer: number) {
  const progress = 1 - timer / 60;
  const newDim = state.dims + 1;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  ctx.fillStyle = DIM_COLORS[newDim - 1];
  ctx.globalAlpha = 0.3 + 0.7 * Math.sin(progress * Math.PI);
  ctx.font = 'bold 48px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${newDim}D`, canvasSize / 2, canvasSize / 2 - 10);

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px "Courier New", monospace';
  ctx.fillText(`Entering dimension ${newDim}...`, canvasSize / 2, canvasSize / 2 + 30);

  const newControls = ['W/S', 'Q/E', 'R/F', 'T/G'];
  if (newDim - 3 < newControls.length) {
    ctx.fillStyle = DIM_COLORS[newDim - 1];
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(`New controls: ${newControls[newDim - 3]}`, canvasSize / 2, canvasSize / 2 + 55);
  }
}
