/** tr text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Kare',
  'perf.ping': 'Ping',
  'perf.memory': 'Bellek',
  'perf.scene': 'Sahne',
} satisfies Partial<Record<keyof typeof en, string>>;
