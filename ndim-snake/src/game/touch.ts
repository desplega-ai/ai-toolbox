import { Vec, vecUnit, vecNegate, vecEquals } from '../math/vector';

const SWIPE_THRESHOLD = 30;

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
}

export type DirectionCallback = (dir: Vec) => void;
export type TapCallback = () => void;

export function setupTouchControls(
  canvas: HTMLCanvasElement,
  getDims: () => number,
  getCurrentDir: () => Vec,
  onDirection: DirectionCallback,
  onTap: TapCallback,
) {
  let swipe: SwipeState | null = null;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    swipe = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!swipe) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipe.startX;
    const dy = touch.clientY - swipe.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - swipe.startTime;

    if (dist < SWIPE_THRESHOLD && elapsed < 300) {
      // Tap — acts like spacebar
      onTap();
      swipe = null;
      return;
    }

    if (dist >= SWIPE_THRESHOLD) {
      const dims = getDims();
      const currentDir = getCurrentDir();
      let newDir: Vec | null = null;

      // Determine primary axis of swipe
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe → X axis
        newDir = vecUnit(dims, 0, dx > 0 ? 1 : -1);
      } else {
        // Vertical swipe → Y axis (inverted: swipe up = -Y in game)
        newDir = vecUnit(dims, 1, dy < 0 ? -1 : 1);
      }

      if (newDir && !vecEquals(newDir, vecNegate(currentDir))) {
        onDirection(newDir);
      }
    }

    swipe = null;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
}

export function createDimensionButtons(
  container: HTMLElement,
  getDims: () => number,
  getCurrentDir: () => Vec,
  onDirection: DirectionCallback,
) {
  const btnContainer = document.createElement('div');
  btnContainer.id = 'dim-buttons';
  btnContainer.style.cssText = `
    display: none;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    max-width: 100vw;
  `;
  container.appendChild(btnContainer);

  const dimLabels = ['Z', 'W', 'V', 'U'];
  const dimColors = ['#4444FF', '#FFFF44', '#44FFFF', '#FF44FF'];

  for (let i = 0; i < 4; i++) {
    const axis = i + 2; // Z=2, W=3, V=4, U=5
    const label = dimLabels[i];
    const color = dimColors[i];

    const plusBtn = document.createElement('button');
    plusBtn.textContent = `${label}+`;
    plusBtn.className = 'dim-btn';
    plusBtn.style.cssText = `
      background: ${color}22;
      color: ${color};
      border: 1px solid ${color}66;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      font-weight: bold;
      touch-action: manipulation;
      cursor: pointer;
      min-width: 52px;
    `;
    plusBtn.dataset.axis = String(axis);
    plusBtn.dataset.sign = '1';

    const minusBtn = plusBtn.cloneNode(true) as HTMLButtonElement;
    minusBtn.textContent = `${label}-`;
    minusBtn.dataset.sign = '-1';

    btnContainer.appendChild(plusBtn);
    btnContainer.appendChild(minusBtn);
  }

  // Event delegation
  btnContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (!target.classList.contains('dim-btn')) return;

    const axis = parseInt(target.dataset.axis || '0');
    const sign = parseInt(target.dataset.sign || '1');
    const dims = getDims();
    const currentDir = getCurrentDir();

    if (axis >= dims) return;

    const newDir = vecUnit(dims, axis, sign);
    if (!vecEquals(newDir, vecNegate(currentDir))) {
      onDirection(newDir);
    }
  }, { passive: false });

  return {
    update(dims: number) {
      if (dims <= 2) {
        btnContainer.style.display = 'none';
        return;
      }
      btnContainer.style.display = 'flex';
      const buttons = btnContainer.querySelectorAll('.dim-btn') as NodeListOf<HTMLElement>;
      buttons.forEach(btn => {
        const axis = parseInt(btn.dataset.axis || '0');
        btn.style.display = axis < dims ? 'block' : 'none';
      });
    }
  };
}
