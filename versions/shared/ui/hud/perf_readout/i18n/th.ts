/** Thai text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'เฟรม',
  'perf.ping': 'Ping',
  'perf.memory': 'หน่วยความจำ',
  'perf.scene': 'ฉาก',
} satisfies Partial<Record<keyof typeof en, string>>;
