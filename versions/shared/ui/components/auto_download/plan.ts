import type { AssetGroup } from '@/controllers/assets/assetDownload';

/**
 * What the first run takes first: everything but the music and the maps other than the login
 * scene and the main towns (Lorencia, Devias, Noria, Elbeland, the character scene). Map groups go by
 * their index id (`map:<world folder>`). The rest follows.
 */
const ESSENTIAL_MAPS = new Set(['map:1', 'map:3', 'map:4', 'map:52', 'map:74']);

export function isEssential(group: AssetGroup): boolean {
  return group.kind === 'map' ? ESSENTIAL_MAPS.has(group.id) : group.kind !== 'audio';
}

/** The build this browser last finished a full download for (`?direct` writes it too). */
export { FIRST_RUN_DONE_KEY as DONE_KEY } from '@/controllers/assets/assetDownload';

/** A build not yet fully downloaded here runs it again (cached files are skipped). */
export function firstRunDue(doneBuild: string | null, build: string): boolean {
  return doneBuild !== build;
}
