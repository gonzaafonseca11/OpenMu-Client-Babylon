/** German text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Bild',
  'perf.ping': 'Ping',
  'perf.memory': 'Speicher',
  'perf.scene': 'Szene',
} satisfies Partial<Record<keyof typeof en, string>>;
