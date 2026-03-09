import { Vec, vecUnit, vecNegate, vecEquals } from '../math/vector';

interface KeyBinding {
  positive: string;
  negative: string;
  axis: number;
  dimLabel: string;
}

const KEY_BINDINGS: KeyBinding[] = [
  { positive: 'ArrowRight', negative: 'ArrowLeft', axis: 0, dimLabel: 'X' },
  { positive: 'ArrowUp', negative: 'ArrowDown', axis: 1, dimLabel: 'Y' },
  { positive: 'KeyW', negative: 'KeyS', axis: 2, dimLabel: 'Z' },
  { positive: 'KeyQ', negative: 'KeyE', axis: 3, dimLabel: 'W' },
  { positive: 'KeyR', negative: 'KeyF', axis: 4, dimLabel: 'V' },
  { positive: 'KeyT', negative: 'KeyG', axis: 5, dimLabel: 'U' },
];

export function getControlsForDims(dims: number): KeyBinding[] {
  return KEY_BINDINGS.slice(0, dims);
}

export function getDirectionFromKey(code: string, dims: number, currentDir: Vec): Vec | null {
  const bindings = getControlsForDims(dims);

  for (const binding of bindings) {
    let newDir: Vec | null = null;

    if (code === binding.positive) {
      newDir = vecUnit(dims, binding.axis, binding.axis === 1 ? -1 : 1);
    } else if (code === binding.negative) {
      newDir = vecUnit(dims, binding.axis, binding.axis === 1 ? 1 : -1);
    }

    if (newDir) {
      // Prevent reversing direction
      const reverse = vecNegate(currentDir);
      if (vecEquals(newDir, reverse)) return null;
      return newDir;
    }
  }

  return null;
}

export function getControlsDisplay(dims: number): string[] {
  const controls = getControlsForDims(dims);
  return controls.map(b => {
    const posLabel = b.positive.replace('Arrow', '').replace('Key', '');
    const negLabel = b.negative.replace('Arrow', '').replace('Key', '');
    return `${b.dimLabel}: ${negLabel}/${posLabel}`;
  });
}
