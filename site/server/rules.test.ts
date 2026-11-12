import { describe, expect, it } from 'vitest';
import { chatBanned, chatMessage, chatTooFast, clean, isBanned, isModerator, newsPost, reportPost } from './rules';

describe('community rules', () => {
  it('strips control characters and keeps lines only where asked', () => {
    expect(clean('  hola\u0000 che\n  ', false)).toBe('hola che');
    expect(clean('a\r\nb\n\n\n\nc', true)).toBe('a\nb\n\nc');
    expect(clean(42, false)).toBe('');
  });

  it('takes a chat line of 1 to 300 characters', () => {
    expect(chatMessage('  ')).toEqual({ error: 'Escribí algo.' });
    expect(chatMessage('x'.repeat(301))).toHaveProperty('error');
    expect(chatMessage('<b>hola</b>')).toEqual({ text: '<b>hola</b>' });
  });

  it('needs a title and a text for the news', () => {
    expect(newsPost('', 'x')).toHaveProperty('error');
    expect(newsPost('Evento', 'Doble experiencia\nel sábado')).toEqual({ title: 'Evento', body: 'Doble experiencia\nel sábado' });
  });

  it('slows a fast talker down', () => {
    expect(chatTooFast([], 10_000)).toBe(false);
    expect(chatTooFast([9000], 10_000)).toBe(true);
    expect(chatTooFast([5000], 10_000)).toBe(false);
    // 15 in the last minute, the newest 4 s ago: the per-minute cap, not the gap.
    expect(chatTooFast(Array.from({ length: 15 }, (_, i) => 1000 + i * 3500), 54_000)).toBe(true);
    expect(chatTooFast(Array.from({ length: 14 }, (_, i) => 1000 + i * 3500), 54_000)).toBe(false);
  });

  it('knows moderators, banned accounts and chat bans', () => {
    expect([0, 1, 2, 3, 4, 5].map(isModerator)).toEqual([false, false, true, true, false, false]);
    expect([0, 2, 4, 5].map(isBanned)).toEqual([false, false, true, true]);
    expect(chatBanned(null)).toBe(false);
    expect(chatBanned(new Date(Date.now() + 60_000))).toBe(true);
    expect(chatBanned('2000-01-01T00:00:00Z')).toBe(false);
  });
});

describe('reports', () => {
  it('needs a kind, a body, a name for players, and an http link if any', () => {
    expect(reportPost('bug', '', 'se cae', '')).toEqual({ kind: 'bug', target: '', body: 'se cae', link: '' });
    expect(reportPost('player', 'Pepe', 'hack', 'https://imgur.com/x')).toEqual({ kind: 'player', target: 'Pepe', body: 'hack', link: 'https://imgur.com/x' });
    expect(reportPost('player', '', 'hack', '')).toHaveProperty('error');
    expect(reportPost('nope', '', 'x', '')).toHaveProperty('error');
    expect(reportPost('migration', '', 'mi DK de MuX', '')).toHaveProperty('error');
    expect(reportPost('migration', 'x', 'mi DK de MuX', 'https://imgur.com/a/1')).toEqual({ kind: 'migration', target: '', body: 'mi DK de MuX', link: 'https://imgur.com/a/1' });
    expect(reportPost('bug', '', 'x', 'javascript:alert(1)')).toHaveProperty('error');
  });
});
