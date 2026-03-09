export const GRID_SIZES: Record<number, number> = {
  2: 20,
  3: 12,
  4: 8,
  5: 5,
  6: 4,
};

export const DIM_COLORS = [
  '#FF4444', // X - Red
  '#44FF44', // Y - Green
  '#4444FF', // Z - Blue
  '#FFFF44', // W - Yellow
  '#44FFFF', // V - Cyan
  '#FF44FF', // U - Magenta
];

export const DIM_LINE_WIDTHS = [3, 3, 2.5, 2, 1.5, 1];
export const DIM_OPACITIES = [1.0, 1.0, 0.9, 0.8, 0.7, 0.6];

export const DIM_NAMES = ['X', 'Y', 'Z', 'W', 'V', 'U'];

export const VIEW_DISTANCES = [3, 4, 5, 6]; // perspective distances for dims 3+

export const ROTATION_SPEEDS: Record<number, number[]> = {
  // For each dimension count, speeds for each active rotation plane
  2: [],
  3: [0.15, 0.19],             // XZ, YZ
  4: [0.13, 0.17, 0.11],       // XW, YW, ZW
  5: [0.11, 0.14, 0.09, 0.16], // XV, YV, ZV, WV
  6: [0.10, 0.12, 0.08, 0.14, 0.11], // XU, YU, ZU, WU, VU
};

export const TICK_MS = 150; // base game tick in ms
export const CANVAS_SIZE = 700;
export const SNAKE_COLOR = '#FFFFFF';
export const FOOD_COLOR = '#FF8800';
export const BG_COLOR = '#0a0a0a';
