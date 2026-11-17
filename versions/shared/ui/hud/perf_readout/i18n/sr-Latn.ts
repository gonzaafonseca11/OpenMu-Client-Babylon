/** sr-Latn text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Sličica',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Scena',
} satisfies Partial<Record<keyof typeof en, string>>;
