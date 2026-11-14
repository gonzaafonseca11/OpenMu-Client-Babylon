import { describe, expect, it } from 'vitest';
import { isBannedCharacter } from './banned';

describe('isBannedCharacter', () => {
  it('reads the banned bit OpenMU sends in the list status', () => {
    expect(isBannedCharacter({ Status: 1 })).toBe(true);
    expect(isBannedCharacter({ Status: 0 })).toBe(false);
    expect(isBannedCharacter({ Status: 32 })).toBe(false);
  });
});
