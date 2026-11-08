import { describe, expect, it } from 'vitest';
import { checkOptions, checkStats, durabilityFor, experienceForLevel, matchOptions, optionLabel, parseBrowse, setName, type ItemOption } from './gm';

const opts: ItemOption[] = [
  { id: 'e1', kind: 'excellent', number: 1, label: 'Zen', maxLevel: 4 },
  { id: 'luck', kind: 'luck', number: 0, label: 'Luck', maxLevel: 4 },
  { id: 'o1', kind: 'option', number: 0, label: 'Adicional', maxLevel: 4 },
  { id: 'o2', kind: 'option', number: 3, label: 'Adicional 2', maxLevel: 4 },
];

describe('GM item maker', () => {
  it('grows durability like the classic client: +15 excellent is base + 62, capped at 255', () => {
    expect(durabilityFor(50, 15, true)).toBe(112);
    expect(durabilityFor(78, 15, true)).toBe(140);
    expect(durabilityFor(220, 15, false)).toBe(255);
    expect(durabilityFor(50, 0, false)).toBe(50);
  });

  it('keeps only the item own options, one extra option, levels in range', () => {
    expect(checkOptions(opts, [{ id: 'e1', level: 0 }, { id: 'o1', level: 4 }])).toEqual({ links: [{ option: opts[0], level: 0 }, { option: opts[2], level: 4 }] });
    expect(checkOptions(opts, [{ id: 'nope', level: 0 }])).toHaveProperty('error');
    expect(checkOptions(opts, [{ id: 'o1', level: 5 }])).toHaveProperty('error');
    expect(checkOptions(opts, [{ id: 'o1', level: 0 }])).toHaveProperty('error');
    expect(checkOptions(opts, [{ id: 'o1', level: 1 }, { id: 'o2', level: 1 }])).toHaveProperty('error');
  });

  it('gives a level the experience OpenMU holds at its start', () => {
    expect(experienceForLevel(1)).toBe(0);
    expect(experienceForLevel(330)).toBe(820362580);
  });

  it('accepts stats inside the limits only', () => {
    const ok = { level: 400, resets: 51, strength: 32500, agility: 1, vitality: 100, energy: 32500, points: 0, zen: 2_000_000_000 };
    expect(checkStats(ok, false)).toEqual({ ...ok, leadership: null });
    expect(checkStats({ ...ok, leadership: 500 }, true)).toHaveProperty('leadership', 500);
    expect(checkStats({ ...ok, strength: 32501 }, false)).toHaveProperty('error');
    expect(checkStats({ ...ok, level: 0 }, false)).toHaveProperty('error');
    expect(checkStats({ ...ok, zen: 1.5 }, false)).toHaveProperty('error');
  });

  it('reads the type list and names sets by their armor', () => {
    expect(parseBrowse('sets')).toBe('sets');
    expect(parseBrowse('jewelry')).toBe('jewelry');
    expect(parseBrowse('7')).toBe(7);
    expect(parseBrowse('99')).toBeNull();
    expect(parseBrowse('')).toBeNull();
    expect(setName('Venom Mist Armor')).toBe('Venom Mist');
  });

  it('carries the picked options to another piece of the set', () => {
    const helm: ItemOption[] = [
      { id: 'h1', kind: 'excellent', number: 1, label: 'Zen', maxLevel: 4 },
      { id: 'hl', kind: 'luck', number: 0, label: 'Luck', maxLevel: 4 },
      { id: 'ho', kind: 'option', number: 0, label: 'Adicional', maxLevel: 4 },
    ];
    expect(matchOptions(opts, [{ id: 'e1', level: 0 }, { id: 'luck', level: 0 }, { id: 'o1', level: 4 }], helm)).toEqual([
      { id: 'h1', level: 0 }, { id: 'hl', level: 0 }, { id: 'ho', level: 4 },
    ]);
  });

  it('names options in Spanish', () => {
    expect(optionLabel('excellent', 'Maximum Health', 6)).toBe('Vida máxima +4%');
    expect(optionLabel('luck', null, 0)).toMatch(/Luck/);
  });
});
