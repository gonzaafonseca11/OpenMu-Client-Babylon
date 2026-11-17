/** fa text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'فریم',
  'perf.ping': 'پینگ',
  'perf.memory': 'حافظه',
  'perf.scene': 'صحنه',
} satisfies Partial<Record<keyof typeof en, string>>;
