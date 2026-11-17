/** ca text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Fotograma',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Escena',
} satisfies Partial<Record<keyof typeof en, string>>;
