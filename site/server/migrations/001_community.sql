-- The site's own storage (site/readme.md): the community chat and the server news.
-- Not OpenMU's database: the site only reads that one.

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  at         INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS chat_messages_at ON chat_messages (at);

CREATE TABLE IF NOT EXISTS news (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  at         INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
