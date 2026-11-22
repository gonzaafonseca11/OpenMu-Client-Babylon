import { describe, expect, it } from 'vitest';
import { isLoginAttemptWarning } from './serverLines';

describe('isLoginAttemptWarning', () => {
  // OpenMU tells the session in game when the right password is refused as "already connected".
  it('knows the warning OpenMU sends the logged-in session', () => {
    expect(isLoginAttemptWarning("Another user attempted to login this account. If it wasn't you, we suggest you to change your password.")).toBe(true);
  });

  it('is not fooled by other system lines', () => {
    expect(isLoginAttemptWarning('mati entered the game.')).toBe(false);
    expect(isLoginAttemptWarning('Another user')).toBe(false);
  });
});

// The original prints no line on a level-up; OpenMU's congratulation and our "Level N" are left out.
describe('isLevelUpLine', () => {
  it('knows OpenMU level and master level congratulations', async () => {
    const { isLevelUpLine } = await import('./serverLines');
    expect(isLevelUpLine('Congratulations, you are Level 247 now.')).toBe(true);
    expect(isLevelUpLine('Congratulations, you are Master Level 12 now.')).toBe(true);
    expect(isLevelUpLine('mati entered the game.')).toBe(false);
  });
});
