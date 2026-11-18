import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { runInAction } from 'mobx';
import { AppState, UIState } from '@/controllers/interface/uiState';
import { assetDownload, type AssetGroup } from '@/controllers/assets/assetDownload';
import { setGameOption } from '@/controllers/settings';
import { AutoDownload, wantedNow } from '.';

const set = (state: UIState, running: boolean) =>
  runInAction(() => {
    AppState.uiState = state;
    assetDownload.running = running;
  });

afterEach(() => {
  set(UIState.Preloader, false);
  setGameOption('volume', 0);
});

describe('the first-run download (AutoDownload)', () => {
  // The screen and the panel are gone: the download runs in the background, unseen, and never pauses the game.
  it('draws nothing and never holds the game, even while the essentials download', () => {
    for (const state of [UIState.Preloader, UIState.Login]) {
      set(state, true);
      expect(renderToStaticMarkup(<AutoDownload />)).toBe('');
      expect(assetDownload.blocking).toBe(false);
    }
  });

  it('leaves the sounds out while the volume is 0 and takes them once it is raised', () => {
    const audio = { kind: 'audio' } as AssetGroup;
    const map = { kind: 'map' } as AssetGroup;
    expect([wantedNow(audio), wantedNow(map)]).toEqual([false, true]);
    setGameOption('volume', 3);
    expect(wantedNow(audio)).toBe(true);
  });
});
