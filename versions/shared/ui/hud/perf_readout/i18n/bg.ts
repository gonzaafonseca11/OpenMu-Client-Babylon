/** Bulgarian text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Кадър',
  'perf.ping': 'Пинг',
  'perf.memory': 'Памет',
  'perf.scene': 'Сцена',
} satisfies Partial<Record<keyof typeof en, string>>;
