import { reaction } from 'mobx';
import { AppState, UIState } from '../../controllers/interface/uiState';
import { ServerConfig } from './serverConfig';

/**
 * What the browser tab says. `index.html` ships the client's own name so the
 * tab reads right before any script runs; from the character list on it is the
 * world the player logged into - the name its published list entry carried, or
 * the one typed into the setup tab. A client pinned to its own world
 * (`directLogin.ts`) says that world's name from the start.
 *
 * The one writer of `document.title`.
 */

/** Also the installed app's name, in `public/manifest.webmanifest`. */
const CLIENT_NAME = 'OpenMUCB';

/** A published name is capped at 60 chars; a typed one is not. */
const MAX_SERVER_NAME = 60;

/** Past the login form the world is known, and stays so until the way out. */
const LOGGED_IN = new Set([
  UIState.Characters,
  UIState.LoadingWorld,
  UIState.World,
]);

export function titleFor(state: UIState, serverName: string, pinned = false): string {
  if (!pinned && !LOGGED_IN.has(state)) return CLIENT_NAME;

  return serverName.trim().slice(0, MAX_SERVER_NAME) || CLIENT_NAME;
}

/** Call once from boot. */
export function watchPageTitle(): void {
  reaction(
    () =>
      titleFor(
        AppState.uiState,
        // The placeholder `active` hands out when there is no world at all is
        // not a name anybody chose.
        ServerConfig.isEmpty ? '' : ServerConfig.active.name,
        ServerConfig.pinned !== null
      ),
    title => {
      document.title = title;
    },
    { fireImmediately: true }
  );
}
