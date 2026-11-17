/** Romanian text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Cadru',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Scenă',
} satisfies Partial<Record<keyof typeof en, string>>;
