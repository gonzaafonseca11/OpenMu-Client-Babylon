/** Chinese text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': '帧',
  'perf.ping': '延迟',
  'perf.memory': '内存',
  'perf.scene': '场景',
} satisfies Partial<Record<keyof typeof en, string>>;
