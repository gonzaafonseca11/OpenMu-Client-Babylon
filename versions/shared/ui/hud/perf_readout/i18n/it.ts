/** Italian text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Frame',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Scena',
} satisfies Partial<Record<keyof typeof en, string>>;
