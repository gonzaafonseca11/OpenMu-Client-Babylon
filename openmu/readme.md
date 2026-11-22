# openmu

Our plugins for OpenMU. We do not ship or fork OpenMU: the installer runs OpenMU the OpenMU way (its
repository at a release tag, its `deploy/all-in-one` compose, the official `munique/openmu` image),
and this folder adds one thin layer on top.

## What is here

```
plugins/            MuPlugins.csproj: one DLL with every plugin, compiled against the image's own assemblies
  StartupHook.cs    loads the DLL before OpenMU starts (DOTNET_STARTUP_HOOKS), so its plugin discovery finds it
  GameLogic/        marketplace escrow: token check, item and Zen moves (EscrowToken, MarketplaceEscrowAction);
                    Modules/IModulePacketPlugIn and Views/Modules/IModulePacketViewPlugIn (module packets);
                    LoginTokens/: the token table, issue and token login, the upkeep task; Views/LoginTokens
  GameServer/       packet group 0xE7: the group handler, the escrow request handler, the result view,
                    the login token handlers (03, 05) and view (04);
                    the module packet 0xE8: ModulePacketHandlerPlugIn and ModulePacketViewPlugIn
Dockerfile          FROM the OpenMU image, + plugins/ in /app/plugins, + the startup hook
appsettings.Production.json   adds a compact JSON log (logs/events-*.jsonl) that ops/server reads
```

## How it works

- OpenMU's `PlugInManager` registers every `[PlugIn]` type in the loaded assemblies. The startup hook
  loads our DLL first, so our plugins register like built-in ones and show in the admin panel
  (Packet Handlers: "Marketplace Group Handler", "Marketplace Escrow Request Handler", "Module Packet
  Handler", "Login Token Request Handler", "Token Login Handler"; view plugins: "Marketplace Escrow
  Result", "Module Packet", "Login Token"; periodic task: "Login Token Upkeep").
- OpenMU's own external-assembly option (`ExternalAssemblyName`) loads `plugins\<name>`, a relative
  Windows path, and fails in the Linux image; the startup hook avoids it.
- A plugin outside OpenMU sees only public types. `MarketplaceGroupHandler` repeats the few lines of
  OpenMU's internal `GroupPacketHandlerPlugIn`; the result view reads the internal
  `RemotePlayer.Connection` once by reflection and fails loudly if OpenMU renames it.

Marketplace escrow: the client sends a token the marketplace service signed (`C1 len E7 01 <token>`).
The plugin checks signature, expiry, account and character, then moves an item between the bag and
an escrow box (an `ItemStorage` owned by nobody), or pays out the Zen waiting in a box. It answers
`C1 len E7 02 op status listingId boxId amount itemLen item`. Config: `MARKETPLACE_ESCROW_SECRET`, the
same value the marketplace service has; without it every token is refused.

Module packets (phase 4 of [docs/module_streaming.md](../docs/module_streaming.md)): a client module's
packets travel inside one code, `0xE8`, in both directions: `C1 len E8 idLength id payload`, or C2
(two length bytes) when the frame does not fit 255 bytes, the client's `src/modules/_api/packetWire.ts`.

- `ModulePacketHandlerPlugIn` (a packet handler for 0xE8, no encryption expected) drops every frame
  until the player's character is in the world (the login and character screens, a disconnect; a
  trade, a dialog or death still count as in the world), then reads the module id
  and hands the payload to the `IModulePacketPlugIn` whose `Key` is that id, found with
  `PlugInManager.GetStrategy` the way OpenMU finds chat commands. `IModulePacketPlugIn` is a plugin
  point (`IStrategyPlugIn<string>`): a module's server half is a `[PlugIn]` class implementing it, with
  `HandlePacketAsync(player, payload)`. A frame for an id with no plugin (or a malformed one) is
  dropped; each such id is logged once (the first 64). No module ships yet, so nothing is registered
  and every frame is dropped.
- `ModulePacketViewPlugIn` (`IModulePacketViewPlugIn`) sends one player a module's frame:
  `player.InvokeViewPlugInAsync<IModulePacketViewPlugIn>(p => p.SendModulePacketAsync(id, payload))`.
  It refuses an id that is not a module id and a frame over 65535 bytes, and writes C1 or C2 by the
  same rule as the client. Like the escrow result view, it reads `RemotePlayer.Connection` by
  reflection.
- Nothing to switch: the handler and the view are in the DLL every installed server runs, and the
  client's router is in every client; with no module plugin they do nothing.

Login tokens (phase 6 of [docs/module_streaming.md](../docs/module_streaming.md), the wire there): the
web client's saved login, so no password is kept in a browser.

- `LoginTokenStore`: the table `mu_plugins.login_token` in OpenMU's database (our own schema),
  through OpenMU's admin connection as OpenMU reads it (`ConnectionSettings.xml`, `DB_HOST`,
  `DB_ADMIN_PW`) and OpenMU's own Npgsql. A row is a token's SHA-256, the account id, the issue time
  and a SHA-256 of the account's password hash at issue: the token itself is never stored, and a
  password change voids every token of the account. 30 days, at most 10 per account. Backups: the
  table is in the database `mu backup` dumps (`openmu.dump`).
- `LoginTokenAction`: E7 03 issues a token at the character list (once per connection); E7 05 logs in
  with one, step for step as OpenMU's `LoginAction` (master, 64c534a), then replaces it and sends the new
  one (E7 04) behind the login result. Like `LoginAction` it reserves the account at the login server
  before loading it and remembers that on the player (`SetLoginServerRegistration`): OpenMU logs a
  leaving player off only through that registration (see Ghost sessions). `LoginAction` holds the state
  machine's lock across the login server call through a context whose `Allowed` setter is internal; the
  plugin checks the transition first, makes it last, and releases the registration (once) if it then fails.
- `LoginTokenUpkeepPlugIn` (a periodic task): creates the table at start when it is missing and
  drops expired tokens hourly. The store creates it on first use too.
- The client offers tokens only on a world whose `server.json` says `loginTokens: true`; the
  installer writes that, since this DLL is in every image it builds.

Vaults (`GameLogic/Vaults`, Mu Bardo): the chat command `/baul 0-5`, with the vault window closed,
points the account's vault at vault N. Vault 0 is the account's own vault, recorded on first use in
`mu_plugins.vault_home`; vaults 1-5 are `ItemStorage` rows whose ids are a SHA-256 of the account id
and N, made when first opened. Each keeps its own items and Zen; nothing is ever moved or deleted.

## Change it

- add a plugin: a new `[PlugIn]` class under `plugins/`, public OpenMU types only. Rebuild with
  `mu update` (or `docker build -t mu-openmu:local openmu`).
- another OpenMU version: `mu config` > OpenMU version. The DLL is recompiled against that image, so
  an API change shows up as a build error, not at run time.
- a database newer than the last release: `mu config` > OpenMU version > the latest main branch (each
  `mu update` takes OpenMU's newest commit) or a fixed commit or tag; OpenMU's own
  `src/Startup/Dockerfile` builds the base image.

## Tests

Built and run by the installer's end-to-end run: the plugins appear active in
`config."PlugInConfiguration"` and `logs/events-*.jsonl` is written. Its `check`
(`install/cli/loginCheck.ts`) plays the game as the test GM: module frames dropped before the world
and read in it, and the login tokens (issue, token login reaching the character list, the replaced
and a junk token refused, the new one working). Nothing here is compiled outside the image.

## Character bans

`plugins/GameLogic/Bans`: the speed check bans the character, not the account. OpenMU's own
`SpeedHackDetectPlugIn` keeps counting warnings with its AutoBan and DisconnectOnViolation off;
`CharacterSpeedBanPlugIn` reads that count, and past MaxWarnings sets `CharacterStatus.Banned`, writes
why to `mu_plugins.character_ban` and disconnects. OpenMU still lets a banned character in, so
`BannedCharacterGatePlugIn` cancels its entry; the web client greys out Connect for it. The website's GM
panel lists them and lifts a ban (`site/server/bans.ts`) while the account is out of the game.

## Save guard

OpenMU 0.9.10 fails every later save of a session once an item is deleted while an option link of it is still
unsaved (issue #1478, fixed upstream by #988): a jewel's new option, or a chaos weapon fresh from a mix, used in
the next mix. `GameLogic/SaveGuard/SaveBeforeMixPlugIn` saves the player when an item goes into a mix tray, and
`GameServer/RemoteView/SaveGuard/SaveAfterCraftingResultPlugIn` (OpenMU's crafting result, then a save) after
each mix, so no mix deletes an unsaved option. Drop both once OpenMU includes #988.

The same failure came from the ground: a quest reward on a full inventory (`QuestCompletionAction`, and the
event rewards that drop a `CreateNew` item) lies there unsaved, and the pickup attaches it as if it were
saved, so every later save tries to insert its option links for an item row that does not exist (FK
`FK_ItemOptionLink_Item_ItemId`). One player lost a reset, a shield and hours of play to it, twice, from the
Elf Soldier's Ancient Stick +4. `GameLogic/SaveGuard/SaveUnsavedDropPlugIn` saves the player such an item is
dropped for, as it lands; a player's own drop was saved before it fell, and a generated drop is a
`TemporaryItem`, so neither is touched.

## Login retries

A login refused as "already connected" has loaded the account into the player's context already, and
OpenMU's account load (`AccountRepository.GetByIdAsync`) returns what that context tracks instead of reading
it again. With `retryLoginWhenConnected` the client retries on the same connection, so a quick reconnect
whose first try met the old session still saving got the copy from before that save. Seen live: harrypoter
used two Jewels of Life with the vault open (no periodic save in that state), the connection dropped, the
resume got that copy, and using those jewels again failed every save of the session, trades included.
`GameLogic/LoginRetry/FreshLoginPlugIn` empties the player's context as each login starts (OpenMU's
`LoginAction` changes the state before it loads), and the token login calls it before its own loads. A retry
that found something to forget logs "Fresh login: ... retried a login on the same connection".

## Skills after a reset

OpenMU checks no level or energy when a skill is cast, only mana and AG; the web client greys a skill out below
the level and energy of its row (`CheckSkillUseCondition`). `GameLogic/ResetSkills/ResetSkillsPlugIn` tells the
client's skills module, on each entry to the world from the character list (a reset logs out there), whether the
character made a real reset: more resets than the starter gift gave it (10 for one made from 2026-11-09 23:14 UTC,
when the gift began; 0 before). With 1 the client lifts both rules for learned skills
(`src/modules/skills/resetWaiver.ts`); switching the plugin off leaves the original rule. If the starter gift ends,
`HasRealReset` needs its end date too.

## Ghost players

One account's character was on the server twice for over a day (the status API listed it twice): an offline
session the offline manager no longer held kept playing a copy beside the real character. When the real one's
pet broke and was deleted, every save of the copy failed on that pet (`Save conflict for "Item" ... state
Modified`, 766 times). How the copy outlived its handover was not found. `GameServer/SessionSweep/
GhostPlayerSweepPlugIn` takes out, every 30 s and after a minute of grace, an `OfflinePlayer` that is not the
one the manager holds for its account, and a `RemotePlayer` whose connection is closed or already cleared (the
disconnect sets it to null: after `/offlevel` the player it handed over to the offline session stayed listed
like that, counted as online until a restart). It disposes them, which
removes them from the game and drops their context: a ghost's stale copy is never saved over the real one.
Each removal is logged as "Ghost player removed".

## Offline sessions across servers

`/offlevel` hands the character to an offline session on its game server and logs the account off at the login
server. A login on that server stops the session first and loads what it saved; a login on another game server
never looked (each server has its own `OfflinePlayerManager`), so the offline character kept playing there beside
the logged-in one, both saving the same character (one player's levels and resets went up and down all day).
`GameLogic/Offline/OfflineAcrossServersPlugIn` (`IPlayerStateChangingPlugIn`), when a login reaches the character
list, ends the account's offline sessions on the other game servers without saving them: the login had already
loaded the character, and OpenMU saves every minute, so at most that minute of offline play is lost. It takes the
session out of the manager's private `_activePlayers` and stops its helper (`_intelligence`) by reflection, and
logs an error if OpenMU renames them.

## Ghost sessions

An account the login server holds while nobody of it is on any game server answers "already connected"
everywhere until a restart. The admin panel's Online Accounts is the login server's list (an empty Character
there is an account at the character list, or one held by nobody), and its Disconnect logs the account off there.

The cause seen live: OpenMU master logs a leaving player off only through the registration its login left on
the player (`ReleaseLoginServerRegistration`, `GameServer.OnPlayerDisconnectedAsync`). Our token login was
written against 0.9.10, which logged off by the account, and never set it: every session opened with a token
("remember me", and the client's reconnect) kept its account held after it left. `LoginTokenAction` sets it now.

`GameServer/SessionSweep/GhostSessionSweepPlugIn` (a periodic task, every 30 s per game server) is the safety
net: an account the login server holds for that server with no player of it there (and no offline session)
for over 60 s is logged off, with a warning in the log ("Ghost session freed").

## Socket drops

`plugins/GameLogic/SocketExcellentDrop`: LaCleon and Vulcanus monsters drop an excellent socket item 1
in 200 kills (OpenMU never makes one). `plugins/GameLogic/SocketCount`: every socket item a monster drops
(OpenMU's own drops and that plugin's) gets its socket count again from a falling scale, 1: 50 %,
2: 30 %, 3: 15 %, 4: 4 %, 5: 1 %, capped by the item's `MaximumSockets`; OpenMU rolls it evenly. It runs
before the drop lands (`IMonsterItemDropPlugIn`), so the floor shows the bag's count (as the drop was added it was too late: the floor kept the first roll), and leaves items players drop alone (those
are no `TemporaryItem`). Turn it off in the admin panel: "Socket count by chance".

## VIP Blood Castle experience
OpenMU gives a mini game's experience reward as configured (`MiniGameRewardService`), past every
experience rate, so the VIP server's x2 never reached it. `plugins/GameLogic/Vip/VipBloodCastleExperiencePlugIn.cs`
gives each finisher on the VIP server the flat Blood Castle experience rewards again when the game ends
(`IMiniGameEndedPlugIn`): those for everyone, plus the winners' or the losers' ones. The experience per
remaining second is not repeated (the remaining time is not public). Turn it off in the admin panel:
"VIP Blood Castle experience".
