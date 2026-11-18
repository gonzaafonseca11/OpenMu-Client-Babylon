# auto_download

Ours, from gonzaPollini/mu-season1-client: the first-run download, in the background and unseen.
Mounted by `src/app/App.tsx` (not a HUD window: those draw only in the world).

## Public API
- `index.tsx`: `AutoDownload` (draws nothing), `wantedNow` (the sounds only while the volume is above 0).
- `plan.ts`: `isEssential`, `firstRunDue`, `DONE_KEY`.

## How it works
- Once the worlds page's Enter moves the app on (`UIState.Login` or later), and only on a world whose
  build ships lighter assets for a player who reads them (`liteAssetsReady`, `modules/servers`: the
  installer's setting and the `liteAssets` improvement), it runs `startDownload` twice: the essentials
  (`isEssential`: all but the music and the far maps), then every group `wantedNow` takes (cached files
  skipped). Groups with a bundle come down as one file (`controllers/assets`, Bundles).
- Nothing is shown and the game is never held (`assetDownload.blocking` stays off): a file the game
  needs before the download reaches it is read on its own, as without the download. The screen and the
  panel it had were taken out: they covered the login on every server update for files already held.
- The game starts silent (`controllers/sound`, Silent start), so the sounds are left out while the volume
  is 0 and downloaded in the background as soon as the player raises it (`soundsWhenHeard`).
- A finished run stores the build id in `mu_auto_download_build`; that build never runs it again, a new
  one checks its files (cached ones are skipped, an unchanged bundle is kept by its hash).

## Depends on / used by
- uses: `controllers/assets` (`assetDownload`), `controllers/interface` (`AppState`), `controllers/settings`
  (the volume), `modules/servers` (`liteAssetsReady`).
- used by: `src/app/App.tsx`.

## Tests
- `plan.test.ts`: the essential groups, once per build.
- `index.test.tsx`: draws nothing and never holds the game; the sounds only once the volume is up.
