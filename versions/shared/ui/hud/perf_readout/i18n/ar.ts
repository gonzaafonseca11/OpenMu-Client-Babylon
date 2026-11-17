/** ar text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'الإطار',
  'perf.ping': 'البينغ',
  'perf.memory': 'ذاكرة',
  'perf.scene': 'مشهد',
} satisfies Partial<Record<keyof typeof en, string>>;
