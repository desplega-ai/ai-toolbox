import { Vec } from './vector';
import { Matrix, rotationMatrix, matMul, matVecMul, identity } from './matrix';
import { VIEW_DISTANCES } from '../config';

export interface RotationState {
  angles: number[]; // one angle per active rotation plane
  planes: [number, number][]; // which planes are rotating
}

export function getRotationPlanes(dims: number): [number, number][] {
  if (dims <= 2) return [];
  const planes: [number, number][] = [];
  const newest = dims - 1;
  for (let i = 0; i < newest; i++) {
    planes.push([i, newest]);
  }
  return planes;
}

export function buildRotationMatrix(dims: number, state: RotationState): Matrix {
  let m = identity(dims);
  for (let i = 0; i < state.planes.length; i++) {
    const [a, b] = state.planes[i];
    const r = rotationMatrix(dims, a, b, state.angles[i]);
    m = matMul(r, m);
  }
  return m;
}

export function projectPoint(point: Vec, dims: number, rotMatrix: Matrix, gridSize: number): [number, number] {
  // Center the point around origin
  const centered = point.map(c => c - (gridSize - 1) / 2);

  // Apply rotation
  const rotated = matVecMul(rotMatrix, centered);

  // Perspective projection chain: nD → 2D
  let p = [...rotated];
  for (let dim = p.length - 1; dim >= 2; dim--) {
    const vd = VIEW_DISTANCES[dim - 2] || 4;
    const scale = gridSize * 0.5; // normalize by grid size
    const d = vd / (vd - p[dim] / scale);
    p = p.slice(0, dim).map(c => c * d);
  }

  return [p[0], p[1]];
}
