/** id text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Frame',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Adegan',
} satisfies Partial<Record<keyof typeof en, string>>;
