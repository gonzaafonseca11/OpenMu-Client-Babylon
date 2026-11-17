/** zh-Hant text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': '影格',
  'perf.ping': '延遲',
  'perf.memory': '記憶體',
  'perf.scene': '場景',
} satisfies Partial<Record<keyof typeof en, string>>;
