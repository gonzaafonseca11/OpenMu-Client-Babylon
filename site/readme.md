# site

The world's own website, on its bare domain (`https://<domain>`, IP mode: port 8082): the PK and
reset rankings anyone can read, and a player's characters behind a login with their game account.

## Files

- `server/main.ts`: the Bun server. Serves `public/`, the logo (`public/ui/world_select/logo.webp`
  of the client) and the JSON API: `GET /api/ranking/pk`, `GET /api/ranking/resets` (cached a
  minute), `POST /api/login`, `POST /api/logout`, `GET /api/me`.
- `server/queries.ts`: every read from OpenMU's database. Rankings leave out Game Masters,
  spectators, banned accounts or characters, bots and templates.
- `server/session.ts`: the login session, a signed cookie (HttpOnly, SameSite=Strict, 7 days)
  holding the account id and a fingerprint of its password hash, so a password change ends it.
- `public/`: the page (`index.html`, `site.css`, `site.js`), plain files, no build. Text goes into
  the page with `textContent`, never as HTML, and the CSP allows only the site's own files.

## Safety

- It connects as `mu_site` (`install/cli/siteRole.ts`): SELECT on the tables it shows and on six
  columns of `data."Account"` (never e-mail, vault or security code), and every transaction read
  only. The installer sets the role up after every start, update and settings change.
- Login: ten attempts per network in ten minutes (`src/core/rateLimit.ts`), a missing account
  answers as slowly as a wrong password, banned accounts are refused.

## Environment

`PORT`, `HOSTNAME`, `DATABASE_URL`, `SITE_SESSION_SECRET` (empty: logins refused),
`SITE_SECURE_COOKIE` (`off` only without HTTPS), `SITE_NAME`, `SITE_PLAY_URL`,
`SITE_REGISTER_URL`, `TRUSTED_PROXIES`, `LOGIN_LIMIT`. The installer renders them
(`install/cli/render/env.ts`).

## Run it locally

`bun run site` with `DATABASE_URL` pointing at an OpenMU database and `SITE_SECURE_COOKIE=off`.
