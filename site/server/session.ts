import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The site's login session: a signed cookie, nothing stored server side. It names the account and
 * carries a fingerprint of its password hash, so a password change ends every session of it.
 */

export const SESSION_COOKIE = 'mubardo_session';
export const SESSION_DAYS = 7;

type Claims = { a: string; f: string; e: number };

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** A short fingerprint of a password hash: changes with the password, reveals nothing of it. */
export function fingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);
}

export function issue(secret: string, accountId: string, passwordHash: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ a: accountId, f: fingerprint(passwordHash), e: now + SESSION_DAYS * 86_400_000 } satisfies Claims));
  return `${body}.${sign(secret, body)}`;
}

/** The session's account and password fingerprint, or null when it is forged, malformed or expired. */
export function read(secret: string, token: string | undefined, now = Date.now()): { accountId: string; fingerprint: string } | null {
  if (!token || !secret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = new TextEncoder().encode(sign(secret, body));
  const got = new TextEncoder().encode(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<Claims>;
    if (typeof claims.a !== 'string' || typeof claims.f !== 'string' || typeof claims.e !== 'number') return null;
    return claims.e > now ? { accountId: claims.a, fingerprint: claims.f } : null;
  } catch {
    return null;
  }
}

/** The cookie's value from a Cookie header. */
export function cookieValue(header: string | null, name = SESSION_COOKIE): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86_400}${secure ? '; Secure' : ''}`;
}

export function clearedCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
