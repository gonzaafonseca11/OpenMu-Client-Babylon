/** Vietnamese text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Khung hình',
  'perf.ping': 'Ping',
  'perf.memory': 'Bộ nhớ',
  'perf.scene': 'Cảnh',
} satisfies Partial<Record<keyof typeof en, string>>;
