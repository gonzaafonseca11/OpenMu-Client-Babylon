import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { BurstLimit, bucketFor, clientIp } from '../../src/core/rateLimit';
import { accountCharacters, accountEmail, accountHash, characterNames, findAccount, pkRanking, resetRanking, resetsNow, type RankedCharacter } from './queries';
import { openMonthly } from './monthly';
import { clearedCookie, cookieValue, fingerprint, issue, read, sessionCookie } from './session';
import { openCommunity } from './community';
import { chatBanned, chatMessage, chatTooFast, clean, isBanned, isModerator, newsPost, REPORT_STATUSES, REPORTS_PER_HOUR, reportPost } from './rules';
import { normalEmail, openMuHash, openRecovery, passwordProblem, recoveryMail, recoveryTargets, sendMail } from './recovery';
import { isEmail } from '../../src/modules/servers/registerRules';
import { vipGrant, vipList, vipOf } from './vip';
import { browseItems, giveItem, giveSet, itemOptions, learnAllSkills, maxMasterTree, onlinePlayers, parseBrowse, readStats, setExcellents, writeStats } from './gm';

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
/** The site's own SQLite file: the community chat and the news. */
/** OpenMU's web API, asked who is online before the GM panel writes. Empty: the panel writes nothing. */
const OPENMU_API_URL = process.env.OPENMU_API_URL || '';
/** Account recovery mail (recovery.ts): Resend API key and sender; empty = recovery is off. */
const MAIL_API_KEY = process.env.MAIL_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || '';
/** The site's public address, for the links in recovery mail. */
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const SITE_DB_PATH = process.env.SITE_DB_PATH || join(import.meta.dir, '..', '.data', 'site.sqlite');

/** Login attempts per network in ten minutes: enough for typos, too few to guess passwords. */
const LOGIN_LIMIT = Number(process.env.LOGIN_LIMIT || 10);
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
/** The rankings are read at most this often, however many visitors ask. */
const RANKING_TTL_MS = 60 * 1000;

const sql = postgres(DATABASE_URL, { max: 4, idle_timeout: 60 });
const community = openCommunity(SITE_DB_PATH);
const monthly = openMonthly(community.database, { resetsNow: () => resetsNow(sql), pk: (since, until) => pkRanking(sql, since, until) });
const monthTick = () => monthly.tick().catch(err => console.error('site monthly rankings failed:', err));
void monthTick();
setInterval(monthTick, 60_000).unref();
const logins = new BurstLimit(LOGIN_LIMIT, LOGIN_WINDOW_MS);
const recovery = openRecovery(community.database);
/** Recovery requests per network: a few for typos, too few to flood someone's inbox. */
const recoveries = new BurstLimit(5, 60 * 60 * 1000);
/** Compared against when the account does not exist, so a missing name answers as slowly as a wrong password. */
const DUMMY_HASH = bcrypt.hashSync('not-a-password', 10);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

const PUBLIC = join(import.meta.dir, '..', 'public');
const INDEX = readFileSync(join(PUBLIC, 'index.html'), 'utf8')
  .replaceAll('{{NAME}}', escapeHtml(NAME))
  .replaceAll('{{PLAY_URL}}', escapeHtml(PLAY_URL))
  .replaceAll('{{REGISTER_URL}}', escapeHtml(REGISTER_URL || PLAY_URL))
  // A new start is a new deploy: the page asks for its script and style afresh.
  .replaceAll('{{VERSION}}', Date.now().toString(36));

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

/** How many are in the game, asked of OpenMU at most every 15 s; null when it cannot be asked. Names stay private. */
let onlineHit = { at: 0, count: null as number | null };
async function onlineCount(): Promise<number | null> {
  if (!OPENMU_API_URL) return null;
  if (Date.now() - onlineHit.at < 15_000) return onlineHit.count;
  onlineHit = { at: Date.now(), count: (await onlinePlayers(OPENMU_API_URL))?.length ?? null };
  return onlineHit.count;
}

type SessionAccount ={ id: string; login: string; moderator: boolean; chatBanned: boolean };

/** The logged-in account, when the session is valid, its password has not changed since and it is not banned. */
async function sessionAccount(req: Request): Promise<SessionAccount | null> {
  const session = read(SECRET, cookieValue(req.headers.get('cookie')));
  if (!session) return null;
  const account = await accountHash(sql, session.accountId);
  if (!account || isBanned(account.state) || fingerprint(account.hash) !== session.fingerprint) return null;
  return { id: session.accountId, login: account.login, moderator: isModerator(account.state), chatBanned: chatBanned(account.chatBanUntil) };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const notLoggedIn = () => json({ error: 'Entrá con tu cuenta primero.' }, 401);
const notAllowed = () => json({ error: 'Solo el staff puede hacer esto.' }, 403);

/** The community's POSTs: chat lines, and for moderators news and hiding either. */
async function communityPost(path: string, req: Request): Promise<Response | null> {
  if (!['/api/chat', '/api/chat/delete', '/api/news', '/api/news/delete', '/api/reports', '/api/reports/answer'].includes(path)) return null;
  const account = await sessionAccount(req);
  if (!account) return notLoggedIn();
  const body = await readJson(req);
  if (!body) return json({ error: 'Pedido inválido.' }, 400);

  if (path === '/api/reports') {
    if (account.chatBanned) return json({ error: 'Tenés los reportes bloqueados por un rato.' }, 403);
    const report = reportPost(body.kind, body.target, body.body, body.link);
    if ('error' in report) return json(report, 400);
    if (community.reportsLastHour(account.id) >= REPORTS_PER_HOUR) return json({ error: 'Llegaste al máximo de reportes por hora. Probá más tarde.' }, 429);
    return json({ id: community.postReport(account.id, account.login, report) });
  }

  if (path === '/api/chat') {
    if (account.chatBanned) return json({ error: 'Tenés el chat bloqueado por un rato.' }, 403);
    const message = chatMessage(body.body);
    if ('error' in message) return json(message, 400);
    const names = await characterNames(sql, account.id);
    const author = names.find(n => n.toLowerCase() === String(body.character ?? '').toLowerCase());
    if (!author) return json({ error: 'Elegí uno de tus personajes para hablar.' }, 400);
    if (chatTooFast(community.recentChat(account.id), Date.now())) return json({ error: 'Más despacio: esperá unos segundos.' }, 429);
    return json({ id: community.postChat(account.id, author, message.text) });
  }

  if (!account.moderator) return notAllowed();
  const id = Number(body.id);
  if (path === '/api/chat/delete' && Number.isInteger(id)) {
    community.hideChat(id);
    return json({ ok: true });
  }
  if (path === '/api/news/delete' && Number.isInteger(id)) {
    community.hideNews(id);
    return json({ ok: true });
  }
  if (path === '/api/reports/answer' && Number.isInteger(id)) {
    if (!REPORT_STATUSES.includes(body.status as never)) return json({ error: 'Estado inválido.' }, 400);
    community.answerReport(id, String(body.status), clean(body.reply, true).slice(0, 500));
    return json({ ok: true });
  }
  if (path === '/api/news') {
    const post = newsPost(body.title, body.body);
    if ('error' in post) return json(post, 400);
    return json({ id: community.postNews(account.id, post.title, post.body) });
  }
  return json({ error: 'Pedido inválido.' }, 400);
}

/** The GM panel (site/readme.md): Game Master accounts only. */
async function gmRequest(path: string, req: Request, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/gm/')) return null;
  const account = await sessionAccount(req);
  if (!account) return notLoggedIn();
  if (!account.moderator) return notAllowed();
  if (req.method === 'GET' && path === '/api/gm/winners') return json(monthly.winners());
  if (req.method === 'GET' && path === '/api/gm/vip') return json(await vipList(sql));
  if (req.method === 'POST' && path === '/api/gm/vip') {
    const body = await readJson(req);
    const login = typeof body?.login === 'string' ? body.login.trim() : '';
    if (!login || login.length > 10) return json({ error: 'Escribí la cuenta.' }, 400);
    const result = await vipGrant(sql, login, Number(body?.days));
    if ('error' in result) return json(result, 400);
    process.stdout.write(`gm ${account.login} vip ${result.login} +${Number(body?.days)} days\n`);
    return json(result);
  }
  if (req.method === 'POST' && path === '/api/gm/winners/deliver') {
    const body = await readJson(req);
    const place = Number(body?.place);
    if (!body || !/^\d{4}-\d{2}$/.test(String(body.month)) || !['pk', 'resets'].includes(String(body.kind)) || !Number.isInteger(place)) return json({ error: 'Pedido inválido.' }, 400);
    monthly.deliver(String(body.month), String(body.kind), place, body.delivered === true);
    return json({ ok: true });
  }
  if (req.method === 'GET' && path === '/api/gm/items') {
    const browse = parseBrowse(url.searchParams.get('group'));
    const family = Number(url.searchParams.get('family') ?? -1);
    if (browse === null || !Number.isInteger(family)) return json({ error: 'Pedido inválido.' }, 400);
    return json(await browseItems(sql, browse, family));
  }
  if (req.method === 'GET' && path === '/api/gm/options') {
    const id = url.searchParams.get('id') ?? '';
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Pedido inválido.' }, 400);
    // A whole ancient set (its id is the set group): the excellents its pieces have, to pick from.
    return json(url.searchParams.get('set') === 'ancient' ? await setExcellents(sql, id) : await itemOptions(sql, id));
  }
  if (req.method === 'GET' && path === '/api/gm/stats') {
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, 10);
    const stats = name ? await readStats(sql, name) : null;
    if (!stats) return json({ error: `El personaje "${name}" no existe. Revisá cómo está escrito.` }, 404);
    const online = OPENMU_API_URL ? await onlinePlayers(OPENMU_API_URL) : null;
    return json({ ...stats, online: online?.some(n => n.toLowerCase() === stats.name.toLowerCase()) ?? false });
  }
  if (req.method === 'POST' && (path === '/api/gm/stats' || path === '/api/gm/skills' || path === '/api/gm/master')) {
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!body || !name || name.length > 10) return json({ error: 'Pedido inválido.' }, 400);
    const online = OPENMU_API_URL ? await onlinePlayers(OPENMU_API_URL) : null;
    if (!online) return json({ error: 'No pude ver quién está conectado. Probá de nuevo en un rato.' }, 503);
    if (online.some(n => n.toLowerCase() === name.toLowerCase())) return json({ error: `${name} está conectado. Salí del juego con ese personaje y probá de nuevo.` }, 409);
    if (path === '/api/gm/master') {
      const tree = await maxMasterTree(sql, name);
      if ('error' in tree) return json(tree, 400);
      process.stdout.write(`gm ${account.login} maxed the master tree of ${name} (${tree.count} skills)\n`);
      return json(tree);
    }
    if (path === '/api/gm/skills') {
      const learned = await learnAllSkills(sql, name);
      if ('error' in learned) return json(learned, 400);
      process.stdout.write(`gm ${account.login} taught ${name} ${learned.added} skills\n`);
      return json(learned);
    }
    const result = await writeStats(sql, name, body);
    if ('error' in result) return json(result, 400);
    process.stdout.write(`gm ${account.login} set stats of ${result.name}: ${JSON.stringify(result)}\n`);
    return json(result);
  }
  if (req.method === 'POST' && (path === '/api/gm/give' || path === '/api/gm/give-set')) {
    const body = await readJson(req);
    if (typeof body?.character === 'string') body.character = body.character.trim();
    if (!body || typeof body.character !== 'string' || !body.character || body.character.length > 10 || typeof body.definitionId !== 'string' || !Array.isArray(body.options)) return json({ error: 'Pedido inválido.' }, 400);
    const online = OPENMU_API_URL ? await onlinePlayers(OPENMU_API_URL) : null;
    if (!online) return json({ error: 'No pude ver quién está conectado. Probá de nuevo en un rato.' }, 503);
    if (online.some(n => n.toLowerCase() === String(body.character).toLowerCase())) return json({ error: `${body.character} está conectado. Salí del juego con ese personaje y probá de nuevo.` }, 409);
    const request = {
      character: body.character,
      definitionId: body.definitionId,
      level: Number(body.level),
      skill: body.skill === true,
      options: body.options.map(o => ({ id: String((o as Record<string, unknown>)?.id ?? ''), level: Number((o as Record<string, unknown>)?.level ?? 0) })),
      ancient: body.ancient && typeof body.ancient === 'object' ? { id: String((body.ancient as Record<string, unknown>).id ?? ''), level: Number((body.ancient as Record<string, unknown>).level ?? 0) } : null,
      extras: { excellent: Array.isArray(body.excellent) ? body.excellent.map(String).slice(0, 30) : [], luck: body.luck === true, option: body.extraOption === true },
      sockets: (Array.isArray(body.sockets) ? body.sockets : []).map(o => ({ id: String((o as Record<string, unknown>)?.id ?? ''), level: Number((o as Record<string, unknown>)?.level ?? 0) })),
    };
    if (path === '/api/gm/give-set') {
      const set = await giveSet(sql, request);
      if ('error' in set) return json(set, 400);
      process.stdout.write(`gm ${account.login} gave a set +${body.level} to ${body.character}: ${set.given.join(', ')}\n`);
      return json(set);
    }
    const result = await giveItem(sql, request);
    if ('error' in result) return json(result, 400);
    process.stdout.write(`gm ${account.login} gave ${result.name} +${body.level} to ${body.character} (slot ${result.slot})\n`);
    return json(result);
  }
  return json({ error: 'No encontrado.' }, 404);
}

const RECOVERY_SENT = 'Si la cuenta o el e-mail existen y tienen un e-mail cargado, te mandamos un mail con los pasos. Revisá también la carpeta de spam.';

/** "Forgot my password / account": mails every matching account a one-use link. Same answer either way. */
async function recover(req: Request, ip: string): Promise<Response> {
  if (!MAIL_API_KEY || !MAIL_FROM || !SITE_URL) return json({ error: 'La recuperación de cuentas todavía no está activada. Escribile a un GM.' }, 503);
  if (recoveries.hammering(bucketFor(ip))) return json({ error: 'Pediste demasiadas veces. Esperá un rato.' }, 429);
  const body = await readJson(req);
  const ask = typeof body?.ask === 'string' ? body.ask.trim().slice(0, 100) : '';
  if (!ask) return json({ error: 'Escribí tu cuenta o tu e-mail.' }, 400);
  const byEmail = new Map<string, { login: string; link: string }[]>();
  for (const t of await recoveryTargets(sql, ask)) {
    const link = `${SITE_URL}/#restablecer=${recovery.issue(t.id)}`;
    byEmail.set(t.email, [...(byEmail.get(t.email) ?? []), { login: t.login, link }]);
  }
  for (const [email, accounts] of byEmail) await sendMail(MAIL_API_KEY, MAIL_FROM, email, recoveryMail(SITE_URL, NAME, accounts));
  return json({ ok: true, message: RECOVERY_SENT });
}

/** Sets the new password behind a recovery link, and spends the link. */
async function resetPassword(req: Request): Promise<Response> {
  const body = await readJson(req);
  const token = typeof body?.token === 'string' ? body.token : '';
  const accountId = token ? recovery.peek(token) : null;
  if (!accountId) return json({ error: 'El link venció o ya se usó. Pedí uno nuevo.' }, 400);
  const problem = passwordProblem(body?.password);
  if (problem) return json({ error: problem }, 400);
  const hash = await openMuHash(String(body?.password));
  await sql.begin('read write', tx => tx`UPDATE data."Account" SET "PasswordHash" = ${hash} WHERE "Id" = ${accountId}`);
  recovery.spend(token);
  const account = await accountHash(sql, accountId);
  process.stdout.write(`password reset by mail for ${account?.login ?? accountId}\n`);
  return json({ ok: true, login: account?.login ?? '' });
}

/** A logged-in player sets the account's e-mail; the current password confirms it is them. */
async function setEmail(req: Request): Promise<Response> {
  const account = await sessionAccount(req);
  if (!account) return notLoggedIn();
  const body = await readJson(req);
  const email = normalEmail(body?.email);
  if (!isEmail(email)) return json({ error: 'Escribí un e-mail válido.' }, 400);
  const row = await accountHash(sql, account.id);
  if (!row || typeof body?.password !== 'string' || !(await bcrypt.compare(body.password, row.hash))) return json({ error: 'La contraseña no es correcta.' }, 401);
  await sql.begin('read write', tx => tx`UPDATE data."Account" SET "EMail" = ${email} WHERE "Id" = ${account.id}`);
  return json({ ok: true, email });
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
      if (req.method === 'GET' && path === '/api/ranking/pk-month') return json(await cached('pk-month', () => monthly.pk()));
      if (req.method === 'GET' && path === '/api/ranking/resets-month') return json(await cached('resets-month', () => monthly.resets()));
      if (req.method === 'GET' && path === '/api/me') {
        const account = await sessionAccount(req);
        if (!account) return json({ error: 'No iniciaste sesión.' }, 401);
        return json({ login: account.login, email: await accountEmail(sql, account.id), vip: await vipOf(sql, account.id), moderator: account.moderator, chatBanned: account.chatBanned, characters: await accountCharacters(sql, account.id) });
      }
      if (req.method === 'GET' && path === '/api/reset') {
        const id = recovery.peek(url.searchParams.get('token') ?? '');
        const account = id ? await accountHash(sql, id) : null;
        return account ? json({ login: account.login }) : json({ error: 'El link venció o ya se usó. Pedí uno nuevo.' }, 400);
      }
      if (req.method === 'GET' && path === '/api/online') return json({ online: await onlineCount() });
      if (req.method === 'GET' && path === '/api/news')return json(community.news());
      if (req.method === 'GET' || req.headers.get('content-type')?.startsWith('application/json')) {
        const gm = await gmRequest(path, req, url);
        if (gm) return gm;
      }
      if (req.method === 'GET' && (path === '/api/reports' || path === '/api/reports/all')) {
        const account = await sessionAccount(req);
        if (!account) return notLoggedIn();
        if (path === '/api/reports') return json(community.myReports(account.id));
        return account.moderator ? json(community.allReports()) : notAllowed();
      }
      if (req.method === 'GET' && path === '/api/chat') {
        if (!(await sessionAccount(req))) return notLoggedIn();
        return json(community.chat(Math.max(0, Number(url.searchParams.get('after')) || 0)));
      }
      // JSON only: a cross-site form cannot send it, and the cookie is SameSite=Strict besides.
      if (req.method === 'POST' && req.headers.get('content-type')?.startsWith('application/json')) {
        if (path === '/api/login') return await login(req, clientIp(req, server));
        if (path === '/api/logout') return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie(SECURE_COOKIE) });
        if (path === '/api/recover') return await recover(req, clientIp(req, server));
        if (path === '/api/reset') return await resetPassword(req);
        if (path === '/api/account/email') {
          if (logins.hammering(bucketFor(clientIp(req, server)))) return json({ error: 'Demasiados intentos. Esperá unos minutos.' }, 429);
          return await setEmail(req);
        }
        const answer = await communityPost(path, req);
        if (answer) return answer;
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
