import { describe, expect, it } from 'vitest';
import type { AssetGroup } from '@/controllers/assets/assetDownload';
import { firstRunDue, isEssential } from './plan';

const group = (id: string, kind: AssetGroup['kind']): AssetGroup => ({ id, kind, name: id, files: 1, bytes: 10, transfer: 10, dirs: [] }) as AssetGroup;

describe('the first-run plan', () => {
  it('waits for the interface, creatures, icons and the main towns, not the music or far maps', () => {
    expect(isEssential(group('core', 'core'))).toBe(true);
    expect(isEssential(group('monsters', 'monsters'))).toBe(true);
    expect(isEssential(group('icons', 'icons'))).toBe(true);
    expect(isEssential(group('map:1', 'map'))).toBe(true);
    expect(isEssential(group('audio', 'audio'))).toBe(false);
    expect(isEssential(group('map:38', 'map'))).toBe(false);
  });

  it('runs once per build', () => {
    expect(firstRunDue(null, 'b1')).toBe(true);
    expect(firstRunDue('b1', 'b1')).toBe(false);
    expect(firstRunDue('b1', 'b2')).toBe(true);
  });
});
