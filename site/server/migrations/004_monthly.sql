-- Monthly rankings (site/server/monthly.ts): each character's resets when a month began, and each
-- month's top 3 with whether the GM gave the prize.

CREATE TABLE IF NOT EXISTS months (
  month TEXT    PRIMARY KEY,
  at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_snapshot (
  month        TEXT    NOT NULL,
  character_id TEXT    NOT NULL,
  resets       INTEGER NOT NULL,
  PRIMARY KEY (month, character_id)
);

CREATE TABLE IF NOT EXISTS monthly_winners (
  month     TEXT    NOT NULL,
  kind      TEXT    NOT NULL,
  place     INTEGER NOT NULL,
  name      TEXT    NOT NULL,
  class     TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, kind, place)
);
