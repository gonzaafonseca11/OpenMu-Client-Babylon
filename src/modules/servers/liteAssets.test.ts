import { afterEach, describe, expect, it, vi } from 'vitest';

import * as manifest from './serverManifest';
import { FIDELITY_CLASSIC, FIDELITY_DEFAULT, registerImprovements, setFidelityChoice, type Improvement } from '../../controllers/fidelity';
import { liteAssetsAllowed } from './liteAssets';

/** The world's settings, set per test. A spy, since the test setup has loaded the manifest module already. */
const server: Record<string, boolean> = { liteAssets: true, liteAssetsAllTiers: false };
vi.spyOn(manifest, 'serverSetting').mockImplementation(key => server[key] ?? false);
// `versions/shared/improvements/lite_assets.ts`; the registry is empty under test.
registerImprovements([{ id: 'liteAssets', preset: 'enhanced', server: 'liteAssets' } as unknown as Improvement]);

afterEach(() => {
  setFidelityChoice(FIDELITY_DEFAULT, {});
  server.liteAssets = true;
  server.liteAssetsAllTiers = false;
});

describe('liteAssetsAllowed', () => {
  it('takes the copies on Enhanced where the world ships them', () => {
    setFidelityChoice(FIDELITY_DEFAULT, {});
    expect(liteAssetsAllowed()).toBe(true);
  });

  it('keeps the originals on Classic, for a player who turned it off, and on a world without copies', () => {
    setFidelityChoice(FIDELITY_CLASSIC, {});
    expect(liteAssetsAllowed()).toBe(false);

    setFidelityChoice(FIDELITY_DEFAULT, { liteAssets: false });
    expect(liteAssetsAllowed()).toBe(false);

    setFidelityChoice(FIDELITY_DEFAULT, {});
    server.liteAssets = false;
    expect(liteAssetsAllowed()).toBe(false);
  });

  it('takes the copies on Classic too where the world hands them to every tier, unless the player turned them off', () => {
    server.liteAssetsAllTiers = true;
    setFidelityChoice(FIDELITY_CLASSIC, {});
    expect(liteAssetsAllowed()).toBe(true);

    setFidelityChoice(FIDELITY_CLASSIC, { liteAssets: false });
    expect(liteAssetsAllowed()).toBe(false);

    setFidelityChoice(FIDELITY_CLASSIC, {});
    server.liteAssets = false;
    expect(liteAssetsAllowed()).toBe(false);
  });
});

describe('liteAssetsReady', () => {
  it('waits for the world server.json, then answers like liteAssetsAllowed', async () => {
    const load = vi.spyOn(manifest, 'loadServerManifest').mockResolvedValue(manifest.ORIGINAL_SETTINGS);
    const { liteAssetsReady } = await import('./liteAssets');
    expect(await liteAssetsReady()).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    setFidelityChoice(FIDELITY_CLASSIC, {});
    expect(await liteAssetsReady()).toBe(false);
    load.mockRestore();
  });
});
