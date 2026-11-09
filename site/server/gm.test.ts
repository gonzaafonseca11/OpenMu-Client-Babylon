import { describe, expect, it } from 'vitest';
import { checkAncient, checkOptions, checkSockets, checkStats, durabilityFor, experienceForLevel, matchOptions, optionLabel, parseBrowse, piecePicks, setName, type ItemOption } from './gm';

const opts: ItemOption[] = [
  { id: 'e1', kind: 'excellent', number: 1, label: 'Zen', maxLevel: 4 },
  { id: 'luck', kind: 'luck', number: 0, label: 'Luck', maxLevel: 4 },
  { id: 'o1', kind: 'option', number: 0, label: 'Adicional', maxLevel: 4 },
  { id: 'o2', kind: 'option', number: 3, label: 'Adicional 2', maxLevel: 4 },
];

describe('GM sockets', () => {
  const fire: ItemOption = { id: 's1', kind: 'socket', number: 1, element: 0, label: 'Fuego', maxLevel: 5 };
  const all = [...opts, fire];

  it('fills slots in order, empty ids stay empty, levels 1-5, no more than the item has', () => {
    expect(checkSockets(all, [{ id: 's1', level: 5 }, { id: '', level: 0 }], 3)).toEqual({ slots: [{ option: fire, level: 5 }, null] });
    expect(checkSockets(all, [{ id: 's1', level: 6 }], 3)).toHaveProperty('error');
    expect(checkSockets(all, [{ id: 'e1', level: 1 }], 3)).toHaveProperty('error');
    expect(checkSockets(all, [{ id: '', level: 0 }], 0)).toHaveProperty('error');
    expect(checkOptions(all, [{ id: 's1', level: 0 }])).toHaveProperty('error');
  });

  it('takes an ancient set of the item, bonus 0-2 only when the set has one', () => {
    const hyon: ItemOption = { id: 'a1', kind: 'ancient', number: 1, label: 'Hyon', maxLevel: 2, bonus: 'b1' };
    const gywen: ItemOption = { id: 'a2', kind: 'ancient', number: 1, label: 'Gywen', maxLevel: 0, bonus: null };
    expect(checkAncient([hyon, gywen], { id: 'a1', level: 2 })).toEqual({ ancient: hyon, level: 2 });
    expect(checkAncient([hyon, gywen], { id: 'a2', level: 2 })).toEqual({ ancient: gywen, level: 0 });
    expect(checkAncient([hyon], { id: 'a1', level: 3 })).toHaveProperty('error');
    expect(checkAncient([hyon, fire], { id: 's1', level: 1 })).toHaveProperty('error');
    expect(checkAncient([hyon], null)).toEqual({ ancient: null, level: 0 });
    expect(checkOptions([hyon], [{ id: 'a1', level: 0 }])).toHaveProperty('error');
  });

  it('gives each ancient set piece all its excellents, its luck and its extra option at the top', () => {
    expect(piecePicks(opts, { excellent: ['Zen'], luck: true, option: true })).toEqual([{ id: 'e1', level: 0 }, { id: 'luck', level: 0 }, { id: 'o1', level: 4 }]);
    expect(piecePicks(opts, { excellent: ['Otra'] })).toEqual([]);
    expect(piecePicks(opts, {})).toEqual([]);
  });

  it('names a sphere by its element', () => {
    expect(optionLabel('socket', null, 1, 3)).toBe('Viento: Vida máxima');
  });
});

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

  it('takes one Fenrir kind, with all its lines', () => {
    const horn: ItemOption[] = [
      { id: 'b', kind: 'fenrir', number: 1, label: 'Negro', maxLevel: 1 },
      { id: 'g1', kind: 'fenrir', number: 4, label: 'Dorado', maxLevel: 1 },
      { id: 'g2', kind: 'fenrir', number: 4, label: 'Dorado', maxLevel: 1 },
    ];
    expect(checkOptions(horn, [{ id: 'g1', level: 0 }, { id: 'g2', level: 0 }])).toHaveProperty('links');
    expect(checkOptions(horn, [{ id: 'b', level: 0 }, { id: 'g1', level: 0 }])).toHaveProperty('error');
    expect(optionLabel('fenrir', null, 2)).toMatch(/Azul/);
  });

  it('names options in Spanish', () => {
    expect(optionLabel('excellent', 'Maximum Health', 6)).toBe('Vida máxima +4%');
    expect(optionLabel('luck', null, 0)).toMatch(/Luck/);
  });
});
