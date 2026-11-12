import { describe, expect, test } from 'bun:test';
import { isTown, TOWNS, townSpot } from './move';

describe('townSpot', () => {
  test('stays inside the town spawn area', () => {
    for (const r of [0, 0.5, 0.999]) {
      const spot = townSpot('lorencia', () => r);
      expect(spot.map).toBe(0);
      expect(spot.x).toBeGreaterThanOrEqual(TOWNS.lorencia.x1);
      expect(spot.x).toBeLessThanOrEqual(TOWNS.lorencia.x2);
      expect(spot.y).toBeGreaterThanOrEqual(TOWNS.lorencia.y1);
      expect(spot.y).toBeLessThanOrEqual(TOWNS.lorencia.y2);
    }
  });

  test('takes only the listed towns', () => {
    expect(isTown('noria')).toBe(true);
    expect(isTown('icarus')).toBe(false);
    expect(isTown('toString')).toBe(false);
  });
});
