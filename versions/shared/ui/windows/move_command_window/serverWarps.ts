import type { MoveReqEntry } from '@/controllers/assets/mu';
import type { ExtraWarp } from '@/modules/servers/serverManifest';

/** The file's rows, then the world's `server.json` `warps` the file does not have (by index). */
export function withServerWarps(list: readonly MoveReqEntry[], warps: readonly ExtraWarp[]): MoveReqEntry[] {
  const extra = warps
    .filter(w => !list.some(e => e.index === w.index))
    .map(w => ({ index: w.index, name: w.name, alias: w.name, reqLevel: w.level, reqMaxLevel: 0, zen: w.zen, gate: 0 }));
  return [...list, ...extra];
}
