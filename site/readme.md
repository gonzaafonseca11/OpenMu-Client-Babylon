# site

The world's own website, on its bare domain (`https://<domain>`, IP mode: port 8082): the PK and
reset rankings anyone can read, a player's characters behind a login with their game account, and
the community: server news (anyone reads, Game Master accounts post and delete) and a chat for
logged-in players (Game Masters delete lines).

## Files

- `server/main.ts`: the Bun server. Serves `public/`, the logo (`public/ui/world_select/logo.webp`
  of the client) and the JSON API: `GET /api/ranking/pk`, `GET /api/ranking/resets` (cached a
  minute), `POST /api/login`, `POST /api/logout`, `GET /api/me`.
- `server/queries.ts`: every read from OpenMU's database. Rankings leave out Game Masters,
  spectators, banned accounts or characters, bots and templates.
- `server/community.ts`: chat and news in the site's own SQLite file (`SITE_DB_PATH`,
  `/data/site/site.sqlite`; schema in `server/migrations/`). OpenMU's database is never written.
  Hiding a line only flags it; chat older than 30 days is dropped. `GET /api/news`,
  `GET /api/chat?after=<id>` (logged in; polled every 4 s), `POST /api/chat`, and for Game
  Masters `POST /api/news`, `/api/news/delete`, `/api/chat/delete`.
- `server/rules.ts`: what the community accepts: 1 to 300 characters a chat line, one every 3
  seconds and 15 a minute per account, the speaker one of the account's own characters, OpenMU's
  chat ban (`ChatBanUntil`) honoured, moderators are `AccountState` 2 and 3.
- `server/session.ts`: the login session, a signed cookie (HttpOnly, SameSite=Strict, 7 days)
  holding the account id and a fingerprint of its password hash, so a password change ends it.
- `public/`: the page (`index.html`, `site.css`, `site.js`), plain files, no build. Text goes into
  the page with `textContent`, never as HTML, and the CSP allows only the site's own files.

## Safety

- It connects as `mu_site` (`install/cli/siteRole.ts`): SELECT on the tables it shows and on seven
  columns of `data."Account"` (never e-mail, vault or security code), and every transaction read
  only. What players write lives in the site's own SQLite file, backed up with the other services'. The installer sets the role up after every start, update and settings change.
- Login: ten attempts per network in ten minutes (`src/core/rateLimit.ts`), a missing account
  answers as slowly as a wrong password, banned accounts are refused.

## Environment

`PORT`, `HOSTNAME`, `DATABASE_URL`, `SITE_DB_PATH`, `SITE_SESSION_SECRET` (empty: logins refused),
`SITE_SECURE_COOKIE` (`off` only without HTTPS), `SITE_NAME`, `SITE_PLAY_URL`,
`SITE_REGISTER_URL`, `SITE_SOCIAL_LINKS` (footer links like `Discord=https://...,Instagram=https://...`, from `MU_SITE_SOCIAL_LINKS`; empty = none), `TRUSTED_PROXIES`, `LOGIN_LIMIT`. The installer renders them
(`install/cli/render/env.ts`).

## Run it locally

`bun run site` with `DATABASE_URL` pointing at an OpenMU database and `SITE_SECURE_COOKIE=off`.

## GM panel

Game Master accounts (State 2 or 3) see a "Panel GM" tab: pick a class and an item type, then an item, its level, skill, luck,
the extra option, excellent and wing options, and it is inserted into an offline character's bag
(`server/gm.ts`). The site asks OpenMU's `/api/status` (`OPENMU_API_URL`) who is online first and
refuses a connected character, since OpenMU would overwrite the bag on its next save. The role may
INSERT only into `data."Item"` and `data."ItemOptionLink"` (`install/cli/siteRole.ts`).

The same tab has a stat editor: level (experience set to that level's start), resets, base stats up to 32500, free points and zen of an offline character. The role may UPDATE only those columns.

## Account recovery

Signup asks for an e-mail (register service, both forms). On the site a player can set or change it under Mi cuenta (current password required), and #recuperar takes an account name or an e-mail: every matching account gets a one-use link (an hour, only its hash kept in the site's SQLite) to #restablecer, which sets a new password in OpenMU's format. Mail goes through Resend (MU_SITE_MAIL_KEY, MU_SITE_MAIL_FROM); without them recovery answers that it is off. The answer never says whether an account exists.
