/** uk text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Кадр',
  'perf.ping': 'Пінг',
  'perf.memory': 'Пам’ять',
  'perf.scene': 'Сцена',
} satisfies Partial<Record<keyof typeof en, string>>;
