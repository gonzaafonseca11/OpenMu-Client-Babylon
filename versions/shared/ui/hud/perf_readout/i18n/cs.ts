/** cs text of `versions/shared/ui/hud/perf_readout`. */

import type en from './en';

export default {
  'perf.fps': 'FPS',
  'perf.frame': 'Snímek',
  'perf.ping': 'Ping',
  'perf.memory': 'Pam',
  'perf.scene': 'Scéna',
} satisfies Partial<Record<keyof typeof en, string>>;
