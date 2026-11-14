import { describe, expect, test } from 'bun:test';
import { unbanBlocker } from './bans';

describe('unbanBlocker', () => {
  test('lets a ban go while none of the account is in the game', () => {
    expect(unbanBlocker(['Abyss', 'Otro'], ['Fuma', 'MGDJ'])).toBeNull();
  });

  test('waits while another character of the same account plays, whatever its case', () => {
    expect(unbanBlocker(['Abyss', 'Otro'], ['otro'])).toContain('Otro');
  });
});
