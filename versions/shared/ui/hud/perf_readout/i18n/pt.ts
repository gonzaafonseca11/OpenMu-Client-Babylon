/** Portuguese text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Quadro',
  'perf.ping': 'Ping',
  'perf.memory': 'Mem',
  'perf.scene': 'Cena',
} satisfies Partial<Record<keyof typeof en, string>>;
