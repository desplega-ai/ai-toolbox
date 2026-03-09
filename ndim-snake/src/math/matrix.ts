import { Vec } from './vector';

export type Matrix = number[][];

export function identity(n: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < n; i++) {
    m[i] = new Array(n).fill(0);
    m[i][i] = 1;
  }
  return m;
}

export function rotationMatrix(n: number, axis1: number, axis2: number, angle: number): Matrix {
  const m = identity(n);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[axis1][axis1] = c;
  m[axis1][axis2] = -s;
  m[axis2][axis1] = s;
  m[axis2][axis2] = c;
  return m;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const result: Matrix = [];
  for (let i = 0; i < n; i++) {
    result[i] = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

export function matVecMul(m: Matrix, v: Vec): Vec {
  const n = m.length;
  const result = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result[i] += m[i][j] * v[j];
    }
  }
  return result;
}
