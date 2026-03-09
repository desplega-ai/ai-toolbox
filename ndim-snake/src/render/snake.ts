import { Vec } from '../math/vector';
import { Matrix } from '../math/matrix';
import { projectPoint } from '../math/projection';
import { SNAKE_COLOR, FOOD_COLOR } from '../config';

export function renderSnake(
  ctx: CanvasRenderingContext2D,
  snake: Vec[],
  dims: number,
  rotMatrix: Matrix,
  gridSize: number,
  canvasSize: number,
) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const scale = canvasSize * 0.35 / (gridSize / 2);

  // Draw snake body segments
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Glow effect
  ctx.shadowColor = SNAKE_COLOR;
  ctx.shadowBlur = 8;

  ctx.strokeStyle = SNAKE_COLOR;
  ctx.globalAlpha = 1.0;

  if (snake.length > 1) {
    ctx.beginPath();
    const [hx, hy] = projectPoint(snake[0], dims, rotMatrix, gridSize);
    ctx.moveTo(cx + hx * scale, cy + hy * scale);

    for (let i = 1; i < snake.length; i++) {
      const [px, py] = projectPoint(snake[i], dims, rotMatrix, gridSize);
      ctx.globalAlpha = 1.0 - (i / snake.length) * 0.4;
      ctx.lineTo(cx + px * scale, cy + py * scale);
    }
    ctx.stroke();
  }

  // Draw head as a filled circle
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowBlur = 12;
  const [hx, hy] = projectPoint(snake[0], dims, rotMatrix, gridSize);
  ctx.beginPath();
  ctx.arc(cx + hx * scale, cy + hy * scale, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}

export function renderFood(
  ctx: CanvasRenderingContext2D,
  food: Vec,
  dims: number,
  rotMatrix: Matrix,
  gridSize: number,
  canvasSize: number,
  frame: number,
) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const scale = canvasSize * 0.35 / (gridSize / 2);

  const [fx, fy] = projectPoint(food, dims, rotMatrix, gridSize);

  // Pulsing effect
  const pulse = 1 + 0.3 * Math.sin(frame * 0.1);
  const radius = 6 * pulse;

  ctx.fillStyle = FOOD_COLOR;
  ctx.shadowColor = FOOD_COLOR;
  ctx.shadowBlur = 15 * pulse;
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(frame * 0.1);

  ctx.beginPath();
  ctx.arc(cx + fx * scale, cy + fy * scale, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}
