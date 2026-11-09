import { describe, expect, it } from 'vitest';
import { monthKey, monthlyResets, monthStart } from './monthly';

describe('monthly rankings', () => {
  it('uses Argentina months: 1 Dec 01:00 UTC is still November there', () => {
    expect(monthKey(Date.parse('2026-12-01T01:00:00Z'))).toBe('2026-11');
    expect(monthKey(Date.parse('2026-12-01T03:00:00Z'))).toBe('2026-12');
    expect(monthStart('2026-12').toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('counts resets gained since the snapshot; new characters start with the 10 gifted resets', () => {
    const now = [
      { id: 'a', name: 'Ana', class: 'DW', level: 10, resets: 60 },
      { id: 'b', name: 'Beto', class: 'DK', level: 10, resets: 40 },
      { id: 'c', name: 'Caro', class: 'Elf', level: 10, resets: 15 },
    ];
    const snap = new Map([['a', 58], ['b', 40]]);
    expect(monthlyResets(now, snap).map(c => [c.name, c.resets])).toEqual([['Caro', 5], ['Ana', 2]]);
  });
});
