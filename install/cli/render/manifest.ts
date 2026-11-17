// server.json: the settings every player on this server gets (read by src/modules/servers/serverManifest.ts).
import { createHash } from 'node:crypto';
import type { Config } from '../config';

const MANIFEST_VERSION = 1;

/** Where Caddy serves the modules folder (`caddy.ts`); relative to server.json's host. */
export const MODULES_PATH = '/server-modules/';

/** One streamed module as server.json lists it (`StreamedModuleEntry` in the client). */
export type ModuleEntry = { id: string; version: string; api: string; url: string; sha256: string; signature?: string };

/** A file of the modules folder and its description (`<name>.json`, undefined when there is none). */
export type ModuleFile = { file: string; bytes: Uint8Array; meta: unknown };

const ID = /^[a-z][a-z0-9_]{0,39}$/;
const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const SIGNATURE = /^[A-Za-z0-9_-]{85}[AQgw]$/;
const FILE = /^[A-Za-z0-9_.-]+\.js$/;

/** Why a module file cannot be listed, or its entry. */
function moduleEntry({ file, bytes, meta }: ModuleFile): ModuleEntry | string {
  if (!FILE.test(file)) return 'the file name may only use letters, digits, ".", "_" and "-", and end in .js';
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return `no description: add ${file.slice(0, -3)}.json`;
  const { id, version, api, signature, core } = meta as Record<string, unknown>;
  if (core !== undefined) return 'a streamed module cannot be core';
  if (typeof id !== 'string' || !ID.test(id)) return 'id: lower case letters, digits and _, at most 40';
  if (typeof version !== 'string' || !SEMVER.test(version)) return 'version: like 1.0.0';
  if (typeof api !== 'string' || !api || api.length > 64) return 'api: the module API range, like ^1.1';
  if (signature !== undefined && (typeof signature !== 'string' || !SIGNATURE.test(signature))) return 'signature: the output of tools/modules/sign.ts';
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { id, version, api, url: `${MODULES_PATH}${file}`, sha256, ...(signature === undefined ? {} : { signature }) };
}

/** The modules folder as server.json lists it, and the files left out with why. */
export function moduleEntries(files: readonly ModuleFile[]): { modules: ModuleEntry[]; errors: { file: string; why: string }[] } {
  const modules: ModuleEntry[] = [];
  const errors: { file: string; why: string }[] = [];
  for (const f of files) {
    const entry = moduleEntry(f);
    if (typeof entry === 'string') errors.push({ file: f.file, why: entry });
    else if (modules.some(m => m.id === entry.id)) errors.push({ file: f.file, why: `another file is already ${entry.id}` });
    else modules.push(entry);
  }
  return { modules, errors };
}

/** The client modules players on this world go without: the ones listed, and band when its relay is off. */
export function manifestModulesOff(c: Config): string[] {
  const listed = c.modulesOff.split(',').map(s => s.trim()).filter(Boolean);
  if (!c.band) listed.push('band');
  return [...new Set(listed)].sort();
}

/** `extraWarps` as `server.json` rows: `index:name:level:zen` per entry, malformed ones left out. */
export function manifestWarps(c: Config): { index: number; name: string; level: number; zen: number }[] {
  return c.extraWarps.split(';').flatMap(spec => {
    const m = /^\s*(\d{1,3}):([^:;]{1,32}):(\d{1,4}):(\d{1,9})\s*$/.exec(spec);
    return m ? [{ index: Number(m[1]), name: m[2].trim(), level: Number(m[3]), zen: Number(m[4]) }] : [];
  });
}

/** `dialogPages` as `server.json` texts by page: `page=text` per entry, a page past 199 or an empty text left out. */
export function manifestDialogPages(c: Config): Record<number, string> {
  return Object.fromEntries(
    c.dialogPages.split('|').flatMap(spec => {
      const m = /^\s*(\d{1,3})=(.{1,300})$/.exec(spec.trimEnd());
      return m && Number(m[1]) < 200 && m[2].trim() ? [[Number(m[1]), m[2].trim()]] : [];
    })
  );
}

/** `optionDefaults` as `server.json` numbers: `fidelity`, `lightingQuality`, `materialQuality` 0-2 and `fpsLimit` 0-6 (FPS_LIMIT_STEPS), anything else left out. */
export function manifestOptionDefaults(c: Config): Record<string, number> {
  const max: Record<string, number> = { fidelity: 2, fpsLimit: 6, lightingQuality: 2, materialQuality: 2 };
  return Object.fromEntries(
    c.optionDefaults.split(',').flatMap(spec => {
      const m = /^\s*(\w+)\s*=\s*(\d)\s*$/.exec(spec);
      return m && m[1] in max && Number(m[2]) <= max[m[1]] ? [[m[1], Number(m[2])]] : [];
    })
  );
}

export function serverManifest(c: Config, modules: readonly ModuleEntry[] = []): string {
  const manifest = {
    version: MANIFEST_VERSION,
    settings: {
      heldHitRequest: c.heldHitRequest,
      retryLoginWhenConnected: c.retryLoginWhenConnected,
      muHelperAfterReconnect: c.muHelperAfterReconnect,
      autoManaPotion: c.autoManaPotion,
      autoQuiver: c.autoQuiver,
      restAnyWall: c.restAnyWall,
      jewelryUpgrade: c.jewelryUpgrade,
      jewelBundling: c.jewelBundling,
      liteAssets: c.liteAssets,
      liteAssetsAllTiers: c.liteAssetsAllTiers,
      qualityPresetsOnly: c.qualityPresetsOnly,
      englishMapNames: c.englishMapNames,
      englishItemNames: c.englishItemNames,
      englishSkillNames: c.englishSkillNames,
    },
    modulesOff: manifestModulesOff(c),
    // Our OpenMU plugin issues them, and it is in every OpenMU image the installer builds (openmu/Dockerfile).
    loginTokens: true,
    // The client served beside this file skips the worlds list (src/modules/servers/directLogin.ts).
    directLogin: c.directLogin,
    // Only the worlds list: Start opens this server's game server list.
    directWorld: c.directWorld,
    // The modules folder (`<state>/modules`, state.ts): streamed to every player (docs/module_streaming.md).
    modules,
    // Move window rows the client's MoveReq file lacks; each needs its OpenMU WarpInfo.
    warps: manifestWarps(c),
    // Quest dialog pages with the world's own words (its NPCs, its maps).
    dialogPages: manifestDialogPages(c),
    // What a player's browser starts on (light machines: Classic, 30 FPS), taken once; their own picks stay.
    optionDefaults: manifestOptionDefaults(c),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
