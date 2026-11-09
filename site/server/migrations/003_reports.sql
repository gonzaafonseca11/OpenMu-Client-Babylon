-- Player reports (bugs, cheaters, other), with an optional proof link; the staff answers them.

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT    NOT NULL,
  login      TEXT    NOT NULL,
  kind       TEXT    NOT NULL,
  target     TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL,
  link       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'open',
  reply      TEXT    NOT NULL DEFAULT '',
  at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_account ON reports (account_id, at);
