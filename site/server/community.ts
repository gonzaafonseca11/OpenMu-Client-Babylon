import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { migrate } from '../../tools/sqliteMigrate';

/**
 * The community's storage: chat and news in the site's own SQLite file (`SITE_DB_PATH`), so the
 * site never writes to OpenMU's database. Deleting only hides a row; nothing is ever shown as HTML.
 */

export type ChatRow = { id: number; author: string; body: string; at: number };
export type NewsRow = { id: number; title: string; body: string; at: number };

/** Chat older than this is dropped hourly; the news stay. */
const CHAT_KEEP_MS = 30 * 86_400_000;
const CHAT_PAGE = 100;
const NEWS_PAGE = 20;

export function openCommunity(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  migrate(db, join(import.meta.dir, 'migrations'));

  const latestChat = db.query<ChatRow, [number]>(
    'SELECT id, author, body, at FROM (SELECT * FROM chat_messages WHERE deleted = 0 ORDER BY id DESC LIMIT ?) ORDER BY id'
  );
  const chatAfter = db.query<ChatRow, [number, number]>(
    'SELECT id, author, body, at FROM chat_messages WHERE deleted = 0 AND id > ? ORDER BY id LIMIT ?'
  );
  const insertChat = db.query<{ id: number }, [string, string, string, number]>(
    'INSERT INTO chat_messages (account_id, author, body, at) VALUES (?, ?, ?, ?) RETURNING id'
  );
  const hideChat = db.query<unknown, [number]>('UPDATE chat_messages SET deleted = 1 WHERE id = ?');
  const deletedSince = db.query<{ id: number }, [number]>('SELECT id FROM chat_messages WHERE deleted = 1 AND at > ?');
  const recentBy = db.query<{ at: number }, [string, number]>('SELECT at FROM chat_messages WHERE account_id = ? AND at > ? ORDER BY at');
  const pruneChat = db.query<unknown, [number]>('DELETE FROM chat_messages WHERE at < ?');

  const listNews = db.query<NewsRow, [number]>('SELECT id, title, body, at FROM news WHERE deleted = 0 ORDER BY id DESC LIMIT ?');
  const insertNews = db.query<{ id: number }, [string, string, string, number]>(
    'INSERT INTO news (account_id, title, body, at) VALUES (?, ?, ?, ?) RETURNING id'
  );
  const hideNews = db.query<unknown, [number]>('UPDATE news SET deleted = 1 WHERE id = ?');

  setInterval(() => pruneChat.run(Date.now() - CHAT_KEEP_MS), 60 * 60 * 1000).unref();

  return {
    /** The same file holds the recovery links (recovery.ts). */
    database: db,
    /** The latest page, or what came after `after`; plus what was hidden lately, so open pages drop it too. */
    chat(after: number): { messages: ChatRow[]; hidden: number[] } {
      const messages = after > 0 ? chatAfter.all(after, CHAT_PAGE) : latestChat.all(CHAT_PAGE);
      return { messages, hidden: deletedSince.all(Date.now() - CHAT_KEEP_MS).map(r => r.id) };
    },
    postChat: (accountId: string, author: string, body: string, at = Date.now()) => insertChat.get(accountId, author, body, at)?.id ?? 0,
    hideChat: (id: number) => hideChat.run(id),
    /** When this account posted in the last minute, oldest first. */
    recentChat: (accountId: string, now = Date.now()) => recentBy.all(accountId, now - 60_000).map(r => r.at),
    news: () => listNews.all(NEWS_PAGE),
    postNews: (accountId: string, title: string, body: string, at = Date.now()) => insertNews.get(accountId, title, body, at)?.id ?? 0,
    hideNews: (id: number) => hideNews.run(id),
  };
}

export type Community = ReturnType<typeof openCommunity>;
