/** Japanese text of the `perf_readout` HUD element. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'フレーム',
  'perf.ping': 'Ping',
  'perf.memory': 'メモリ',
  'perf.scene': 'シーン',
} satisfies Partial<Record<keyof typeof en, string>>;
