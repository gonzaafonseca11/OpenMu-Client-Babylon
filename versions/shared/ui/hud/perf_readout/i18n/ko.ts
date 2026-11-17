/** Korean text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': '프레임',
  'perf.ping': '핑',
  'perf.memory': '메모리',
  'perf.scene': '장면',
} satisfies Partial<Record<keyof typeof en, string>>;
