import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { LOOT_ZEN_MAX, lootZenThreshold } = await import('./lootFilter');

describe('zen pile filter', () => {
  it('keeps the old steps and reaches the biggest piles (16.6M seen live)', () => {
    expect(lootZenThreshold(9)).toBe(1_000_000);
    expect(lootZenThreshold(LOOT_ZEN_MAX)).toBe(15_000_000);
    expect(lootZenThreshold(LOOT_ZEN_MAX + 3)).toBe(15_000_000);
  });
});
