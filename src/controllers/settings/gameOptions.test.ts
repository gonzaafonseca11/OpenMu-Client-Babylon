import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameOptions, migrate, offerAutoMana, offerOptionDefaults, optionsFrom, setGameOption } from './gameOptions';

// A world's `server.json` `optionDefaults` (light machines: Classic, 30 FPS) go in once per browser;
// what the player picks afterwards stays, until the world changes its defaults.
describe('offerOptionDefaults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubStorage = () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    });
  };

  it('applies the defaults once, then leaves the player choice alone', () => {
    stubStorage();
    setGameOption('fidelity', 1);
    setGameOption('fpsLimit', 0);

    expect(offerOptionDefaults({ fidelity: 0, fpsLimit: 1 })).toBe(true);
    expect([GameOptions.fidelity, GameOptions.fpsLimit]).toEqual([0, 1]);

    setGameOption('fidelity', 2);
    expect(offerOptionDefaults({ fidelity: 0, fpsLimit: 1 })).toBe(false);
    expect(GameOptions.fidelity).toBe(2);
  });

  it('applies them again when the world changes them', () => {
    stubStorage();
    offerOptionDefaults({ fidelity: 0, fpsLimit: 1 });

    expect(offerOptionDefaults({ fidelity: 0, fpsLimit: 3 })).toBe(true);
    expect(GameOptions.fpsLimit).toBe(3);
  });

  it('does nothing for a world without defaults', () => {
    stubStorage();
    setGameOption('fpsLimit', 0);
    expect(offerOptionDefaults({})).toBe(false);
    expect(GameOptions.fpsLimit).toBe(0);
  });
});

const DROPPED = [
  'darkness',
  'sceneDarkening',
  'contrast',
  'colorTint',
  'saturation',
  'mapGradient',
  'toneMapping',
  'exposure',
];

/** A blob as the grade-era client saved it, every field at its old default. */
const oldBlob = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  shadows: true,
  postProcessing: true,
  toneMapping: true,
  contrast: 5,
  exposure: 5,
  darkness: 8,
  sceneDarkening: true,
  colorTint: 0,
  saturation: 0,
  mapGradient: 3,
  vignette: 13,
  lightingQuality: 0,
  materialQuality: 0,
  ...over,
});

describe('gameOptions migration', () => {
 afterEach(() => {
  vi.restoreAllMocks();
});

  it('leaves a current blob alone', () => {
    const blob = { toneMapper: 3, brightness: 4, vignette: 9 };
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(migrate(blob)).toBe(false);
    expect(blob).toEqual({ toneMapper: 3, brightness: 4, vignette: 9 });
    expect(info).not.toHaveBeenCalled();
  });

  it('turns the automatic mana potion on once for a save from before it was offered', () => {
    const options = optionsFrom({ autoManaPotion: false });
    expect(offerAutoMana(options, false)).toBe(true);
    expect(options.autoManaPotion).toBe(true);
  });

  it('keeps the automatic mana potion off once the player turned it off', () => {
    const options = optionsFrom({ autoManaPotion: false });
    expect(offerAutoMana(options, true)).toBe(false);
    expect(options.autoManaPotion).toBe(false);
  });

  it('starts a new player with the automatic mana potion on', () => {
    expect(optionsFrom({}).autoManaPotion).toBe(true);
  });

  it('maps toneMapping true to the Standard curve and false to none', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const on = oldBlob({ toneMapping: true });
    expect(migrate(on)).toBe(true);
    expect(on.toneMapper).toBe(1);

    const off = oldBlob({ toneMapping: false });
    migrate(off);
    expect(off.toneMapper).toBe(0);
  });

  it('keeps a toneMapper already stored beside the old flag', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const blob = oldBlob({ toneMapping: false, toneMapper: 3 });
    migrate(blob);
    expect(blob.toneMapper).toBe(3);
  });

  it('replaces exposure with brightness 0', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const blob = oldBlob({ exposure: 9 });
    migrate(blob);
    expect(blob.brightness).toBe(0);
    expect('exposure' in blob).toBe(false);
  });

  it('resets the old vignette default and rescales a chosen value', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const untouched = oldBlob({ vignette: 13 });
    migrate(untouched);
    expect(untouched.vignette).toBe(0);

    const chosen = oldBlob({ vignette: 25 });
    migrate(chosen);
    expect(chosen.vignette).toBe(9);

    const low = oldBlob({ vignette: 5 });
    migrate(low);
    expect(low.vignette).toBe(2);
  });

  it('drops the eight retired keys and names each in one console line', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const blob = oldBlob();

    migrate(blob);

    for (const key of DROPPED) expect(key in blob).toBe(false);
    expect(info).toHaveBeenCalledTimes(1);

    const line = info.mock.calls[0][0] as string;
    for (const key of DROPPED) expect(line).toContain(key);
    expect(line).toContain('vignette 13/25 -> 0/9');
  });

  it('keeps the stored tiers', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const blob = oldBlob();
    migrate(blob);
    expect(blob.lightingQuality).toBe(0);
    expect(blob.materialQuality).toBe(0);
  });
});

describe('fidelity in a stored blob', () => {
  it('a save from before Fidelity gets Enhanced and no overrides', () => {
    const loaded = optionsFrom(oldBlob());
    expect(loaded.fidelity).toBe(1);
    expect(loaded.fidelityOverrides).toEqual({});
  });

  it('keeps a stored choice, clamps the preset and drops a bad overrides blob', () => {
    expect(optionsFrom({ fidelity: 0, fidelityOverrides: { torchCrackle: true } }).fidelityOverrides)
      .toEqual({ torchCrackle: true });
    expect(optionsFrom({ fidelity: 7 }).fidelity).toBe(2);
    expect(optionsFrom({ fidelityOverrides: 'x' }).fidelityOverrides).toEqual({});
    expect(optionsFrom({ fidelityOverrides: { a: 1, b: false } }).fidelityOverrides).toEqual({ b: false });
  });
});
