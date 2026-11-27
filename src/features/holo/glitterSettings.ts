export const HOLO_GLITTER_SETTING_KEY = 'holo_glitter';

export interface HoloGlitterSettings {
  density: number;
  size: number;
  brightness: number;
  minMul: number;
  maxMul: number;
  cluster: number;
}

export const DEFAULT_HOLO_GLITTER: HoloGlitterSettings = {
  density: 1.0,
  size: 1.0,
  brightness: 3.0,
  minMul: 1.0,
  maxMul: 2.4,
  cluster: 0.6,
};

export const HOLO_GLITTER_RANGES = {
  density: { min: 0.3, max: 3.0, step: 0.1 },
  size: { min: 0.6, max: 3.0, step: 0.1 },
  brightness: { min: 0.6, max: 4.0, step: 0.1 },
  minMul: { min: 0.3, max: 2.0, step: 0.05 },
  maxMul: { min: 1.0, max: 4.0, step: 0.1 },
  cluster: { min: 0, max: 1, step: 0.05 },
} as const;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function readFinite(record: Record<string, unknown>, key: keyof HoloGlitterSettings): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_HOLO_GLITTER[key];
}

export function clampHoloGlitter(raw: unknown): HoloGlitterSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_HOLO_GLITTER };
  }

  const record = raw as Record<string, unknown>;

  const density = roundTo2(
    clamp(
      readFinite(record, 'density'),
      HOLO_GLITTER_RANGES.density.min,
      HOLO_GLITTER_RANGES.density.max,
    ),
  );
  const size = roundTo2(
    clamp(readFinite(record, 'size'), HOLO_GLITTER_RANGES.size.min, HOLO_GLITTER_RANGES.size.max),
  );
  const brightness = roundTo2(
    clamp(
      readFinite(record, 'brightness'),
      HOLO_GLITTER_RANGES.brightness.min,
      HOLO_GLITTER_RANGES.brightness.max,
    ),
  );
  const minMul = roundTo2(
    clamp(
      readFinite(record, 'minMul'),
      HOLO_GLITTER_RANGES.minMul.min,
      HOLO_GLITTER_RANGES.minMul.max,
    ),
  );
  const clampedMax = roundTo2(
    clamp(
      readFinite(record, 'maxMul'),
      HOLO_GLITTER_RANGES.maxMul.min,
      HOLO_GLITTER_RANGES.maxMul.max,
    ),
  );
  const maxMul =
    clampedMax < minMul ? Math.max(HOLO_GLITTER_RANGES.maxMul.min, minMul) : clampedMax;
  const cluster = roundTo2(
    clamp(
      readFinite(record, 'cluster'),
      HOLO_GLITTER_RANGES.cluster.min,
      HOLO_GLITTER_RANGES.cluster.max,
    ),
  );

  return { density, size, brightness, minMul, maxMul, cluster };
}
