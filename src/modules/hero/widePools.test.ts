import { describe, expect, it } from 'vitest';
import { poolFloors, unwrapCurrent, unwrapMaximum } from './widePools';

const full = { level: 400, str: 32500, agi: 32500, sta: 32500, eng: 32500, leadership: 0 };

describe('16-bit pools past 65535', () => {
  it('lifts a wrapped maximum by whole turns to the class floor (seen live)', () => {
    const gm = poolFloors({ ...full, charClass: 3 });
    expect(unwrapMaximum(264, gm.mp)).toBe(65800); // Grand Master mana
    const bm = poolFloors({ ...full, charClass: 7 });
    expect(unwrapMaximum(63866, bm.hp)).toBe(129402); // Blade Master health with items
    expect(unwrapMaximum(165396 % 65536, poolFloors({ ...full, charClass: 3 }).sd)).toBe(165396);
  });

  it('leaves small pools and already-wide values alone', () => {
    const low = poolFloors({ ...full, charClass: 3, sta: 100, eng: 100, level: 50 });
    expect(unwrapMaximum(380, low.hp)).toBe(380);
    expect(unwrapMaximum(129402, 98335)).toBe(129402);
  });

  it('puts a wrapped current value next to the last one, never over the maximum', () => {
    expect(unwrapCurrent(63866, 129402, 129402)).toBe(129402);
    expect(unwrapCurrent(63000, 120000, 129402)).toBe(128536);
    expect(unwrapCurrent(1000, 2000, 129402)).toBe(1000);
    expect(unwrapCurrent(500, 400, 1000)).toBe(500);
    // Full: the low bits of the maximum mean the maximum, even after a wrong guess (18232 of 83768).
    expect(unwrapCurrent(18232, 18232, 83768)).toBe(83768);
  });
});
