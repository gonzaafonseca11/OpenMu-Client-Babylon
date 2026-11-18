import { useEffect } from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { assetDownload, loadAssetsIndex, startDownload, type AssetGroup } from '@/controllers/assets/assetDownload';
import { AppState, UIState } from '@/controllers/interface/uiState';
import { GameOptions } from '@/controllers/settings';
import { LocalStorage } from '@/core/localStorage';
import { liteAssetsReady } from '@/modules/servers/liteAssets';
import { DONE_KEY, firstRunDue, isEssential } from './plan';

/**
 * Ours, from gonzaPollini/mu-season1-client: past the worlds page, on a world with lighter assets for
 * a player who reads them (`liteAssetsReady`), the first visit of a build downloads every group into
 * the cache worker, in the background and unseen: the essentials first, then the rest. The sounds
 * only while the volume is above 0 (the game starts silent), and as soon as it is raised. Mounted by
 * `src/app/App.tsx`. See readme.md.
 */

const buildId = () => (typeof BUILD_ID === 'string' ? BUILD_ID : 'dev');
let started = false;

/** What the background download takes now: everything but the sounds while nothing is heard. */
export const wantedNow = (group: AssetGroup) => group.kind !== 'audio' || GameOptions.volume > 0;

const ready = async () => (await liteAssetsReady()) && (await loadAssetsIndex());

/** The two runs: the essentials, then everything wanted (cached files skipped). False when not wanted. */
async function firstRun(): Promise<boolean> {
  if (!firstRunDue(LocalStorage.load(DONE_KEY), buildId())) return false;
  if (!(await ready())) return false;
  assetDownload.chooseOnly(isEssential);
  await startDownload();
  if (!assetDownload.done) return false;
  assetDownload.chooseOnly(wantedNow);
  await startDownload();
  if (!assetDownload.done) return false;
  LocalStorage.save(DONE_KEY, buildId());
  return true;
}

/** The sounds, in the background, once the player raises the volume. */
function soundsWhenHeard(): void {
  reaction(
    () => GameOptions.volume > 0,
    async heard => {
      if (!heard || assetDownload.running || !(await ready())) return;
      assetDownload.chooseOnly(g => g.kind === 'audio');
      await startDownload();
    }
  );
}

export const AutoDownload = observer(() => {
  const entered = AppState.uiState >= UIState.Login;

  useEffect(() => {
    if (!entered || started) return;
    started = true;
    soundsWhenHeard();
    void firstRun();
  }, [entered]);

  return null;
});
