/** Polish text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Klatka',
  'perf.ping': 'Ping',
  'perf.memory': 'Pam',
  'perf.scene': 'Scena',
} satisfies Partial<Record<keyof typeof en, string>>;
