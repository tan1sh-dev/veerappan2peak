// Graphics presets tuned for low-end laptops. Low = older integrated GPUs, Medium = default, High = dedicated GPUs.
export const PRESETS = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 0, rocks: 500, farTerrain: true, antialias: false, starCount: 1500, particles: 0.4, coreStep: 2 },
  medium: { pixelRatio: 1.0, shadows: true, shadowSize: 1024, rocks: 1400, farTerrain: true, antialias: false, starCount: 3000, particles: 0.7, coreStep: 1 },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, rocks: 2800, farTerrain: true, antialias: true, starCount: 5000, particles: 1.0, coreStep: 1 },
};

export const DEFAULT_SETTINGS = {
  quality: 'medium', autoQuality: true, mouseSensitivity: 1.0, invertY: false, fov: 70,
  masterVolume: 0.8, sfxVolume: 0.9, ambienceVolume: 0.6, showFps: false, cameraMode: 'third',
};

export function mergeSettings(s) { return { ...DEFAULT_SETTINGS, ...(s || {}) }; }
