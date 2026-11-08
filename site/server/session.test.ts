import { describe, expect, it } from 'vitest';
import { cookieValue, fingerprint, issue, read, sessionCookie } from './session';

const SECRET = 'test-secret';

describe('site session', () => {
  it('reads back what it issued', () => {
    const token = issue(SECRET, 'acc-1', '$2a$hash', 1000);
    expect(read(SECRET, token, 2000)).toEqual({ accountId: 'acc-1', fingerprint: fingerprint('$2a$hash') });
  });

  it('refuses a forged, altered or expired token', () => {
    const token = issue(SECRET, 'acc-1', '$2a$hash', 1000);
    expect(read('other-secret', token, 2000)).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ a: 'acc-2', f: 'x', e: 9e15 })).toString('base64url');
    expect(read(SECRET, `${forged}.${mac}`, 2000)).toBeNull();
    expect(read(SECRET, `${body}.`, 2000)).toBeNull();
    expect(read(SECRET, token, 1000 + 8 * 86_400_000)).toBeNull();
    expect(read(SECRET, undefined)).toBeNull();
    expect(read('', token, 2000)).toBeNull();
  });

  it('changes the fingerprint with the password hash', () => {
    expect(fingerprint('$2a$one')).not.toBe(fingerprint('$2a$two'));
  });

  it('finds its cookie and writes it HttpOnly and strict', () => {
    expect(cookieValue('a=1; mubardo_session=abc.def; b=2')).toBe('abc.def');
    expect(cookieValue(null)).toBeUndefined();
    expect(sessionCookie('t', true)).toMatch(/HttpOnly; SameSite=Strict; .*Secure$/);
  });
});
