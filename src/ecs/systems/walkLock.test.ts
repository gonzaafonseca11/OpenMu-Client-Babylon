import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { walkLocked } = await import('./walkLock');
const { Economy } = await import('@/modules/economy/economy');
const { FIDELITY_CLASSIC, FIDELITY_DEFAULT, setFidelityChoice } = await import('@/controllers/fidelity');

// Ours (`mixLocksWalk`): the hero stands still while the Chaos Machine is open; Classic walks.
describe('walkLocked', () => {
  it('holds the hero while the Chaos Machine is open, unless on Classic', () => {
    Economy.mixOpen = false;
    expect(walkLocked()).toBe(false);
    Economy.mixOpen = true;
    expect(walkLocked()).toBe(true);
    setFidelityChoice(FIDELITY_CLASSIC, {});
    expect(walkLocked()).toBe(false);
    setFidelityChoice(FIDELITY_DEFAULT, {});
    Economy.mixOpen = false;
  });
});
