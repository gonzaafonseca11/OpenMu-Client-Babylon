/**
 * What the community accepts: engine-free checks the server applies before storing anything
 * (and the tests read). Text is stored as typed and always shown as text, never as HTML.
 */

export const CHAT_MAX = 300;
export const NEWS_TITLE_MAX = 120;
export const NEWS_BODY_MAX = 4000;
/** At most one message every few seconds, and so many a minute, per account. */
export const CHAT_GAP_MS = 3000;
export const CHAT_PER_MINUTE = 15;

/** OpenMU's `AccountState`: GameMaster 2 and GameMasterInvisible 3 moderate; Banned 4 and TemporarilyBanned 5 are out. */
export const isModerator = (state: number) => state === 2 || state === 3;
export const isBanned = (state: number) => state >= 4;

/** Control characters out (a line break stays where it makes sense), the ends trimmed. */
export function clean(text: unknown, keepLines: boolean): string {
  if (typeof text !== 'string') return '';
  const kept = [...text.replace(/\r\n?/g, '\n')].filter(ch => {
    const code = ch.charCodeAt(0);
    return (code >= 32 && code !== 127) || (keepLines && ch === '\n');
  });
  const out = kept.join('').trim();
  return keepLines ? out.replace(/\n{3,}/g, '\n\n') : out;
}

/** The message to store, or why not. */
export function chatMessage(body: unknown): { text: string } | { error: string } {
  const text = clean(body, false);
  if (!text) return { error: 'Escribí algo.' };
  if (text.length > CHAT_MAX) return { error: `Máximo ${CHAT_MAX} caracteres.` };
  return { text };
}

export function newsPost(title: unknown, body: unknown): { title: string; body: string } | { error: string } {
  const t = clean(title, false);
  const b = clean(body, true);
  if (!t || !b) return { error: 'La noticia necesita título y texto.' };
  if (t.length > NEWS_TITLE_MAX) return { error: `El título puede tener hasta ${NEWS_TITLE_MAX} caracteres.` };
  if (b.length > NEWS_BODY_MAX) return { error: `El texto puede tener hasta ${NEWS_BODY_MAX} caracteres.` };
  return { title: t, body: b };
}

/** Whether an account may post now, given when it posted lately (newest last). */
export function chatTooFast(recent: readonly number[], now: number): boolean {
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < CHAT_GAP_MS) return true;
  return recent.filter(at => now - at < 60_000).length >= CHAT_PER_MINUTE;
}

/** OpenMU's chat ban reaches the site too. */
export function chatBanned(until: Date | string | null | undefined, now = Date.now()): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now;
}
