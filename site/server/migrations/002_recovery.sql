-- Account recovery (site/server/recovery.ts): one-use password reset links, stored as hashes only.

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT    PRIMARY KEY,
  account_id TEXT    NOT NULL,
  expires    INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
