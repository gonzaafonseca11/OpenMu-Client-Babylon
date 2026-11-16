import { improvementChoice, isOn } from '../../controllers/fidelity';
import { loadServerManifest, serverSetting } from './serverManifest';

/**
 * Whether reads take the lighter copies (`controllers/assets/liteAssets.ts`): the world's
 * `server.json` says its build wrote them, and the player's `liteAssets` improvement is on (off on
 * Classic) or the world hands them to every tier (`liteAssetsAllTiers`) and the player did not turn
 * them off. Installed as the assets gate by `module.ts`.
 */
export function liteAssetsAllowed(): boolean {
  if (!serverSetting('liteAssets')) return false;
  return isOn('liteAssets') || (serverSetting('liteAssetsAllTiers') && improvementChoice('liteAssets') !== false);
}

/** `liteAssetsAllowed` once the world's `server.json` has answered (the first-run download asks before it starts). */
export async function liteAssetsReady(): Promise<boolean> {
  await loadServerManifest();
  return liteAssetsAllowed();
}
