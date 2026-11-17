/** French text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Image',
  'perf.ping': 'Ping',
  'perf.memory': 'Mém',
  'perf.scene': 'Scène',
} satisfies Partial<Record<keyof typeof en, string>>;
