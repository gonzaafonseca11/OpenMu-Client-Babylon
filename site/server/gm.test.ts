import { describe, expect, it } from 'vitest';
import { checkOptions, durabilityFor, optionLabel, type ItemOption } from './gm';

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

  it('names options in Spanish', () => {
    expect(optionLabel('excellent', 'Maximum Health', 6)).toBe('Vida máxima +4%');
    expect(optionLabel('luck', null, 0)).toMatch(/Luck/);
  });
});
