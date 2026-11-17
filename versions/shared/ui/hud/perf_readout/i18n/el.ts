/** el text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Καρέ',
  'perf.ping': 'Ping',
  'perf.memory': 'Μνήμη',
  'perf.scene': 'Σκηνή',
} satisfies Partial<Record<keyof typeof en, string>>;
