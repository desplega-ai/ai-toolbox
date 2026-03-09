import { Vec } from '../math/vector';
import { Matrix } from '../math/matrix';
import { projectPoint } from '../math/projection';
import { DIM_COLORS, DIM_LINE_WIDTHS, DIM_OPACITIES } from '../config';

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  dims: number,
  gridSize: number,
  rotMatrix: Matrix,
  canvasSize: number,
  snakeHead: Vec,
) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const scale = canvasSize * 0.35 / (gridSize / 2);

  // Generate grid edges per dimension axis
  for (let axis = 0; axis < dims; axis++) {
    const color = DIM_COLORS[axis];
    const lineWidth = DIM_LINE_WIDTHS[axis] * 0.3;
    const opacity = DIM_OPACITIES[axis] * 0.25;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = opacity;

    // Draw lines along this axis
    drawGridLines(ctx, dims, gridSize, axis, rotMatrix, cx, cy, scale, snakeHead);
  }

  ctx.globalAlpha = 1.0;
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  dims: number,
  gridSize: number,
  axis: number,
  rotMatrix: Matrix,
  cx: number,
  cy: number,
  scale: number,
  snakeHead: Vec,
) {
  // For performance, only draw edges near the snake in higher dimensions
  const maxDist = dims <= 3 ? gridSize : Math.min(gridSize, 3);

  // Generate all grid points except along `axis`, then draw lines along `axis`
  const otherAxes = [];
  for (let i = 0; i < dims; i++) {
    if (i !== axis) otherAxes.push(i);
  }

  // Iterate over boundary + snake-nearby positions on other axes
  const positions = getRelevantPositions(otherAxes, gridSize, snakeHead, maxDist, dims);

  ctx.beginPath();
  for (const pos of positions) {
    const start: Vec = new Array(dims).fill(0);
    const end: Vec = new Array(dims).fill(0);

    for (let i = 0; i < otherAxes.length; i++) {
      start[otherAxes[i]] = pos[i];
      end[otherAxes[i]] = pos[i];
    }

    start[axis] = 0;
    end[axis] = gridSize - 1;

    const [sx, sy] = projectPoint(start, dims, rotMatrix, gridSize);
    const [ex, ey] = projectPoint(end, dims, rotMatrix, gridSize);

    ctx.moveTo(cx + sx * scale, cy + sy * scale);
    ctx.lineTo(cx + ex * scale, cy + ey * scale);
  }
  ctx.stroke();
}

function getRelevantPositions(
  axes: number[],
  gridSize: number,
  snakeHead: Vec,
  maxDist: number,
  dims: number,
): number[][] {
  if (axes.length === 0) return [[]];

  const positions: number[][] = [];

  if (dims <= 3) {
    // Draw all grid lines for 2D/3D
    generateAllPositions(axes, gridSize, 0, [], positions);
  } else {
    // For higher dims, only draw boundary edges
    generateBoundaryPositions(axes, gridSize, 0, [], positions);
  }

  return positions;
}

function generateAllPositions(
  axes: number[],
  gridSize: number,
  depth: number,
  current: number[],
  result: number[][],
) {
  if (depth === axes.length) {
    result.push([...current]);
    return;
  }
  for (let i = 0; i < gridSize; i++) {
    current.push(i);
    generateAllPositions(axes, gridSize, depth + 1, current, result);
    current.pop();
  }
}

function generateBoundaryPositions(
  axes: number[],
  gridSize: number,
  depth: number,
  current: number[],
  result: number[][],
) {
  if (depth === axes.length) {
    result.push([...current]);
    return;
  }
  // Only draw at boundaries (0 and gridSize-1)
  for (const i of [0, gridSize - 1]) {
    current.push(i);
    generateBoundaryPositions(axes, gridSize, depth + 1, current, result);
    current.pop();
  }
}
