import { describe, expect, it } from 'vitest';
import { GameOptions, defaultGameOption, setGameOption } from '../settings/gameOptions';
import { SoundsManager } from './soundsManager';

// Ours: the game starts silent and loads no sound file until the player raises the volume.
describe('a silent start', () => {
  it('starts with the master volume at 0', () => {
    expect(defaultGameOption('volume')).toBe(0);
  });

  it('plays nothing, and so loads nothing, while the volume is 0, even after the audio unlock', () => {
    const saved = GameOptions.volume;
    SoundsManager.pageInteracted = true;
    setGameOption('volume', 0);
    expect(SoundsManager.pageInteracted).toBe(false);
    setGameOption('volume', 5);
    expect(SoundsManager.pageInteracted).toBe(true);
    SoundsManager.pageInteracted = false;
    expect(SoundsManager.pageInteracted).toBe(false);
    setGameOption('volume', saved);
  });
});
