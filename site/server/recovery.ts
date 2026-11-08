import type { Database } from 'bun:sqlite';
import type { Sql } from 'postgres';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { isEmail, MAX_ACCOUNT_PASSWORD_LENGTH, MIN_ACCOUNT_PASSWORD_LENGTH } from '../../src/modules/servers/registerRules';

/**
 * Account recovery (site/readme.md): a player who forgot the password or the account name asks
 * with either, and the account's e-mail gets one-use links (an hour) to set a new password.
 * Only the token's hash is stored. The answer never says whether an account or e-mail exists.
 */

export const RESET_TTL_MS = 60 * 60 * 1000;
/** The game's password rule (register/server/accounts.ts): printable ASCII, 4 to 10. */
const PASSWORD_RE = /^[!-~]+$/;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_ACCOUNT_PASSWORD_LENGTH || password.length > MAX_ACCOUNT_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener de ${MIN_ACCOUNT_PASSWORD_LENGTH} a ${MAX_ACCOUNT_PASSWORD_LENGTH} caracteres.`;
  }
  if (!PASSWORD_RE.test(password)) return 'La contraseña solo puede tener letras, números y símbolos básicos (sin espacios ni acentos).';
  return null;
}

/** OpenMU's own format: BCrypt `$2a$` at cost 11 (register/server/accounts.ts). */
export async function openMuHash(password: string): Promise<string> {
  const hash = await bcrypt.hash(password, 11);
  return hash.startsWith('$2a$') ? hash : `$2a$${hash.slice(hash.indexOf('$', 1) + 1)}`;
}

export const normalEmail = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

export function openRecovery(db: Database) {
  const insert = db.query<unknown, [string, string, number]>('INSERT INTO reset_tokens (token_hash, account_id, expires) VALUES (?, ?, ?)');
  const find = db.query<{ account_id: string }, [string, number]>('SELECT account_id FROM reset_tokens WHERE token_hash = ? AND used = 0 AND expires > ?');
  const use = db.query<unknown, [string]>('UPDATE reset_tokens SET used = 1 WHERE token_hash = ?');
  const prune = db.query<unknown, [number]>('DELETE FROM reset_tokens WHERE expires < ?');
  setInterval(() => prune.run(Date.now() - 86_400_000), 60 * 60 * 1000).unref();

  return {
    /** A new link token for this account; only its hash is kept. */
    issue(accountId: string, now = Date.now()): string {
      const token = randomBytes(32).toString('base64url');
      insert.run(hashToken(token), accountId, now + RESET_TTL_MS);
      return token;
    },
    /** The account a live token belongs to, or null. */
    peek: (token: string, now = Date.now()) => find.get(hashToken(token), now)?.account_id ?? null,
    spend: (token: string) => use.run(hashToken(token)),
  };
}

export type Recovery = ReturnType<typeof openRecovery>;

type Target = { id: string; login: string; email: string };

/** The accounts a recovery request names: by account name, or every account on an e-mail. Banned ones are left out. */
export async function recoveryTargets(sql: Sql, ask: string): Promise<Target[]> {
  const value = ask.trim();
  if (!value) return [];
  const rows = isEmail(value.toLowerCase())
    ? await sql`SELECT "Id" AS id, "LoginName" AS login, "EMail" AS email FROM data."Account" WHERE lower("EMail") = ${value.toLowerCase()} AND "State" < 4 AND NOT "IsBot" AND NOT "IsTemplate"`
    : await sql`SELECT "Id" AS id, "LoginName" AS login, "EMail" AS email FROM data."Account" WHERE lower("LoginName") = lower(${value}) AND "State" < 4 AND NOT "IsBot" AND NOT "IsTemplate"`;
  return rows.map(r => ({ id: String(r.id), login: String(r.login), email: String(r.email ?? '') })).filter(t => isEmail(t.email));
}

/** The recovery mail: every account on that address, each with its own link. Plain text and simple HTML. */
export function recoveryMail(site: string, server: string, accounts: { login: string; link: string }[]): { subject: string; text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
  const lines = accounts.map(a => `Cuenta: ${a.login}\nCambiar la contraseña: ${a.link}`);
  return {
    subject: `${server}: recuperar tu cuenta`,
    text: `Pediste recuperar tu cuenta de ${server}.\n\n${lines.join('\n\n')}\n\nCada link sirve una vez y vence en 1 hora. Si no fuiste vos, ignorá este mail: tu contraseña no cambia.\n\n${site}`,
    html: `<p>Pediste recuperar tu cuenta de <b>${esc(server)}</b>.</p>${accounts
      .map(a => `<p>Cuenta: <b>${esc(a.login)}</b><br><a href="${esc(a.link)}">Cambiar la contraseña</a></p>`)
      .join('')}<p>Cada link sirve una vez y vence en 1 hora. Si no fuiste vos, ignorá este mail: tu contraseña no cambia.</p>`,
  };
}

/**
 * Sends through Resend's HTTP API (`MAIL_API_KEY`, from `MAIL_FROM`). False when it is not set up
 * or the provider refused; the caller still answers the player the same way.
 */
export async function sendMail(apiKey: string, from: string, to: string, mail: { subject: string; text: string; html: string }): Promise<boolean> {
  if (!apiKey || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) process.stderr.write(`mail to ${to.replace(/^(.).*@/, '$1***@')} refused: ${res.status} ${(await res.text()).slice(0, 200)}\n`);
    return res.ok;
  } catch (err) {
    process.stderr.write(`mail failed: ${(err as Error).message}\n`);
    return false;
  }
}
