/**
 * Ours: a game master's "!" notice and an event's announcement arrive as the same golden banner (OpenMU's
 * `SendGlobalNotificationAsync` only trims the "!"). The client sending the "!" line puts an invisible mark
 * after it, the mark survives the trim, and the client receiving the banner draws a marked one in the GM colour.
 */
const MARK = '⁣';

/** The line as sent: a "!" notice gets the mark; anything else goes as typed. */
export function markGmNotice(text: string): string {
  return text.length > 1 && text.startsWith('!') && !text.startsWith(`!${MARK}`) ? `!${MARK}${text.slice(1)}` : text;
}

/** A banner's text without the mark when a game master sent it, or null for any other banner. */
export function readGmNotice(text: string): string | null {
  return text.startsWith(MARK) ? text.slice(MARK.length) : null;
}
