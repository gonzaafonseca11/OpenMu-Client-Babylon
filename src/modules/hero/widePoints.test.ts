import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { onHeroPacket, unwrapPoints } = await import('./widePoints');
const { Hero } = await import('./state');

// Ours: level-up points past 65535 wrap in the 16-bit packets (66000 showed as 464, seen live).
describe('wide level-up points', () => {
  it('takes the real points from the server plugin', () => {
    onHeroPacket(Uint8Array.from([0xd0, 0x01, 0x01, 0x00])); // 66000
    expect(Hero.points).toBe(66000);
  });

  it('ignores a packet of the wrong size', () => {
    Hero.points = 5;
    onHeroPacket(Uint8Array.from([1]));
    expect(Hero.points).toBe(5);
  });

  it('keeps a wrapped level-up next to the points it had', () => {
    expect(unwrapPoints(471, 66000)).toBe(66007);
    expect(unwrapPoints(65530, 3)).toBe(65530);
    expect(unwrapPoints(300, 290)).toBe(300);
    expect(unwrapPoints(70000, 66000)).toBe(70000);
  });
});
