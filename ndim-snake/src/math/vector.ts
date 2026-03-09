export type Vec = number[];

export function vecAdd(a: Vec, b: Vec): Vec {
  return a.map((v, i) => v + b[i]);
}

export function vecScale(a: Vec, s: number): Vec {
  return a.map(v => v * s);
}

export function vecEquals(a: Vec, b: Vec): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function vecClone(a: Vec): Vec {
  return [...a];
}

export function vecZero(n: number): Vec {
  return new Array(n).fill(0);
}

export function vecUnit(n: number, axis: number, sign: number = 1): Vec {
  const v = vecZero(n);
  v[axis] = sign;
  return v;
}

export function vecKey(v: Vec): string {
  return v.join(',');
}

export function vecNegate(a: Vec): Vec {
  return a.map(v => -v);
}
