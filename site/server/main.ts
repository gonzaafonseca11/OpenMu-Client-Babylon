import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { BurstLimit, bucketFor, clientIp } from '../../src/core/rateLimit';
import { accountCharacters, accountHash, findAccount, pkRanking, resetRanking, type RankedCharacter } from './queries';
import { clearedCookie, cookieValue, fingerprint, issue, read, sessionCookie } from './session';

/**
 * The world's own website (site/readme.md): rankings anyone can read, and a player's characters
 * behind a login with their game account. Read only: it connects to OpenMU's database as a role
 * that may only SELECT (install/cli/siteRole.ts). Caddy publishes it on the world's bare domain.
 */

const PORT = Number(process.env.PORT || 3400);
const HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://mu_site:mu_site@127.0.0.1:5432/openmu';
const SECRET = process.env.SITE_SESSION_SECRET || '';
const SECURE_COOKIE = (process.env.SITE_SECURE_COOKIE || 'on') !== 'off';
const NAME = process.env.SITE_NAME || 'MU';
const PLAY_URL = process.env.SITE_PLAY_URL || '/';
const REGISTER_URL = process.env.SITE_REGISTER_URL || '';

/** Login attempts per network in ten minutes: enough for typos, too few to guess passwords. */
const LOGIN_LIMIT = Number(process.env.LOGIN_LIMIT || 10);
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
/** The rankings are read at most this often, however many visitors ask. */
const RANKING_TTL_MS = 60 * 1000;

const sql = postgres(DATABASE_URL, { max: 4, idle_timeout: 60 });
const logins = new BurstLimit(LOGIN_LIMIT, LOGIN_WINDOW_MS);
/** Compared against when the account does not exist, so a missing name answers as slowly as a wrong password. */
const DUMMY_HASH = bcrypt.hashSync('not-a-password', 10);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

const PUBLIC = join(import.meta.dir, '..', 'public');
const INDEX = readFileSync(join(PUBLIC, 'index.html'), 'utf8')
  .replaceAll('{{NAME}}', escapeHtml(NAME))
  .replaceAll('{{PLAY_URL}}', escapeHtml(PLAY_URL))
  .replaceAll('{{REGISTER_URL}}', escapeHtml(REGISTER_URL || PLAY_URL));

const STATIC: Record<string, { file: string; type: string }> = {
  '/site.css': { file: join(PUBLIC, 'site.css'), type: 'text/css; charset=utf-8' },
  '/site.js': { file: join(PUBLIC, 'site.js'), type: 'text/javascript; charset=utf-8' },
  '/logo.webp': { file: join(import.meta.dir, '..', '..', 'public', 'ui', 'world_select', 'logo.webp'), type: 'image/webp' },
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}

const cache = new Map<string, { at: number; rows: RankedCharacter[] }>();
async function cached(key: string, load: () => Promise<RankedCharacter[]>): Promise<RankedCharacter[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RANKING_TTL_MS) return hit.rows;
  const rows = await load();
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/** The logged-in account, when the session is valid and its password has not changed since. */
async function sessionAccount(req: Request): Promise<{ id: string; login: string } | null> {
  const session = read(SECRET, cookieValue(req.headers.get('cookie')));
  if (!session) return null;
  const account = await accountHash(sql, session.accountId);
  if (!account || account.state >= 4 || fingerprint(account.hash) !== session.fingerprint) return null;
  return { id: session.accountId, login: account.login };
}

async function login(req: Request, ip: string): Promise<Response> {
  if (!SECRET) return json({ error: 'El inicio de sesión no está disponible.' }, 503);
  if (logins.hammering(bucketFor(ip))) return json({ error: 'Demasiados intentos. Esperá unos minutos.' }, 429);
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 10 || password.length > 20) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);

  const account = await findAccount(sql, username);
  const ok = await bcrypt.compare(password, account?.hash ?? DUMMY_HASH);
  if (!account || !ok) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
  if (account.state >= 4) return json({ error: 'Esta cuenta está bloqueada.' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(issue(SECRET, account.id, account.hash), SECURE_COOKIE) });
}

Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
        return new Response(INDEX, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS } });
      }
      const asset = STATIC[path];
      if (req.method === 'GET' && asset) {
        // Small files: always revalidated, so a deploy shows at once; only the logo is kept a while.
        const caching = path === '/logo.webp' ? 'public, max-age=3600' : 'no-cache';
        return new Response(Bun.file(asset.file), { headers: { 'Content-Type': asset.type, 'Cache-Control': caching, ...SECURITY_HEADERS } });
      }
      if (req.method === 'GET' && path === '/api/ranking/pk') return json(await cached('pk', () => pkRanking(sql)));
      if (req.method === 'GET' && path === '/api/ranking/resets') return json(await cached('resets', () => resetRanking(sql)));
      if (req.method === 'GET' && path === '/api/me') {
        const account = await sessionAccount(req);
        if (!account) return json({ error: 'No iniciaste sesión.' }, 401);
        return json({ login: account.login, characters: await accountCharacters(sql, account.id) });
      }
      // JSON only: a cross-site form cannot send it, and the cookie is SameSite=Strict besides.
      if (req.method === 'POST' && req.headers.get('content-type')?.startsWith('application/json')) {
        if (path === '/api/login') return await login(req, clientIp(req, server));
        if (path === '/api/logout') return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie(SECURE_COOKIE) });
      }
      return json({ error: 'No encontrado.' }, 404);
    } catch (err) {
      // Never the database error itself: it would show the schema to anyone.
      console.error(`site ${req.method} ${path} failed:`, err);
      return json({ error: 'Algo falló. Probá de nuevo en un rato.' }, 500);
    }
  },
});

process.stdout.write(`site listening on ${HOSTNAME}:${PORT} (${NAME})${SECRET ? '' : ', SITE_SESSION_SECRET empty: logins refused'}\n`);
