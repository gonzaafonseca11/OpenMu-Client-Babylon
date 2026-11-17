// Writes the lighter copies of a build BESIDE the originals, never over them: each OZJ / OZT as
// `<file>.webp` (the same header, a WebP behind it), each item icon `items/<name>.png` as
// `<name>.webp`, each track `Music/<name>.ogg` as `<name>.opus.ogg` (Ogg Opus at 48 kbps). The
// names are the client's (`liteVariantOf`). The assets index lists them and the client reads them
// only where the world sets `liteAssets` (assets/readme.md).
//
// Runs in `bun run build` after the gzip sidecars, before the assets index, and does nothing unless
// asked: `MU_LITE_ASSETS=on` (the installer's setting) or `--on`. Textures go to WebP quality 90,
// `Interface/` stays lossless; a copy that is not smaller than what the original costs on the wire
// is not written. The music needs `ffmpeg` with libopus; without it the music gets no copies.
//
// `MU_LITE_CACHE=<dir>` keeps each copy there by its original's content, so a build in a fresh tree (every
// server update) reuses the copies of unchanged files instead of encoding them all again.
//
// Usage: MU_LITE_ASSETS=on bun run tools/liteAssets.ts [--root dist] [--bitrate 48k]

import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { cpus } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { liteSourceOf, liteVariantOf } from '../src/controllers/assets/liteAssets';
import { decodeTGA } from '../src/controllers/assets/mu/tga';

/** The trees whose textures get copies (the item icons and the music are found by folder). */
const TREES = ['Data', 'Data-v097d', 'game-assets', 'game-assets-v097d'];

/** `music(source, out)`: writes the Opus copy, true when it did. */
type Options = { music?: (source: string, out: string) => Promise<boolean>; cache?: string };

type Stats = { written: number; reused: number; kept: number; before: number; after: number };
type Make = (source: string, out: string) => Promise<boolean>;

/**
 * `make` through a cache of copies keyed by what they are made from: `kind` (bump it when the encoding
 * changes) and the original's bytes. A `.none` entry remembers a copy that came out no smaller.
 */
function cached(dir: string, kind: string, make: Make, hit: () => void): Make {
  mkdirSync(dir, { recursive: true });
  return async (source, out) => {
    const key = join(dir, `${kind}-${createHash('sha1').update(new Uint8Array(readFileSync(source))).digest('hex')}`);
    if (existsSync(key)) {
      copyFileSync(key, out);
      hit();
      return true;
    }
    if (existsSync(`${key}.none`)) return false;
    const made = await make(source, out);
    if (made) copyFileSync(out, key);
    else writeFileSync(`${key}.none`, '');
    return made;
  };
}

/** Asked for by the installer (`MU_LITE_ASSETS=on`) or by hand (`--on`). */
export function liteAssetsWanted(env: Record<string, string | undefined>, argv: readonly string[]): boolean {
  return env.MU_LITE_ASSETS === 'on' || argv.includes('--on');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) walk(path, out);
    else if (e.isFile()) out.push(path);
  }
  return out;
}

/** Not stale: the copy is newer than its original. */
const fresh = (source: string, out: string) => existsSync(out) && statSync(out).mtimeMs >= statSync(source).mtimeMs;

/** OZJ: 24 bytes of header and a JPEG; OZT: 4 bytes and a TGA. The WebP goes behind the same header. */
async function textureCopy(path: string): Promise<Uint8Array | null> {
  const raw = new Uint8Array(readFileSync(path));
  const ozt = /\.ozt$/i.test(path);
  const head = ozt ? 4 : 24;
  const payload = raw.subarray(head);
  const options = /[\\/]Interface[\\/]/i.test(path) ? { lossless: true, effort: 6 } : { quality: 90, alphaQuality: 90, effort: 6 };

  let webp: Buffer;
  try {
    if (ozt) {
      const { width, height, pixels } = decodeTGA(path, payload);
      webp = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width, height, channels: 4 } })
        .webp(options)
        .toBuffer();
    } else {
      webp = await sharp(payload).webp(options).toBuffer();
    }
  } catch {
    return null;
  }

  // An OZT crosses the wire gzipped, at about a third.
  if (webp.length >= (ozt ? payload.length / 3 : payload.length)) return null;
  const out = new Uint8Array(head + webp.length);
  out.set(raw.subarray(0, head));
  out.set(webp, head);
  return out;
}

async function iconCopy(path: string): Promise<Uint8Array | null> {
  const webp = await sharp(path).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
  return webp.length < statSync(path).size ? new Uint8Array(webp) : null;
}

/** `ffmpeg` with libopus, or null when there is none. */
function ffmpegOpus(bitrate: string): Options['music'] | undefined {
  try {
    const probe = Bun.spawnSync(['ffmpeg', '-hide_banner', '-encoders'], { stderr: 'ignore' });
    if (!probe.stdout.toString().includes('libopus')) return undefined;
  } catch {
    return undefined;
  }
  return async (source, out) => {
    const tmp = `${out}.tmp`;
    const args = ['-v', 'error', '-y', '-i', source, '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on', '-f', 'ogg', tmp];
    const ok = (await Bun.spawn(['ffmpeg', ...args], { stderr: 'pipe' }).exited) === 0 && existsSync(tmp) && statSync(tmp).size < statSync(source).size;
    if (ok) writeFileSync(out, new Uint8Array(readFileSync(tmp)));
    rmSync(tmp, { force: true });
    return ok;
  };
}

/** Every original under `root` that may have a copy, by kind. */
function originals(root: string): { textures: string[]; icons: string[]; music: string[] } {
  const textures = TREES.flatMap(tree => walk(join(root, tree))).filter(p => /\.oz[jt]$/i.test(p));
  const icons = walk(join(root, 'items')).filter(p => /\.png$/i.test(p));
  const music = TREES.flatMap(tree => walk(join(root, tree, 'Music'))).filter(p => /\.ogg$/i.test(p) && !/\.opus\.ogg$/i.test(p));
  return { textures, icons, music };
}

/**
 * Writes the copies under `root`. An original is only ever read: each copy has its own name
 * (`liteVariantOf`), and a copy whose original is gone, or that is no longer smaller, is removed.
 */
export async function writeLiteAssets(root: string, options: Options = {}): Promise<Stats> {
  const stats: Stats = { written: 0, reused: 0, kept: 0, before: 0, after: 0 };
  const { textures, icons, music } = originals(root);

  // A copy left from an earlier build whose original was dropped.
  for (const path of [...TREES.flatMap(tree => walk(join(root, tree))), ...walk(join(root, 'items'))]) {
    const source = liteSourceOf(path.split('\\').join('/'));
    if (source && !existsSync(source)) rmSync(path);
  }

  const jobs: (() => Promise<void>)[] = [];
  const add = (source: string, kind: string, encode: Make) => {
    const make = options.cache ? cached(options.cache, kind, encode, () => stats.reused++) : encode;
    const out = liteVariantOf(source.split('\\').join('/'));
    if (!out || out === source || fresh(source, out)) return;
    jobs.push(async () => {
      if (await make(source, out)) {
        stats.written++;
        stats.before += statSync(source).size;
        stats.after += statSync(out).size;
      } else {
        stats.kept++;
        rmSync(out, { force: true });
      }
    });
  };
  const bytes = (copy: (path: string) => Promise<Uint8Array | null>) => async (source: string, out: string) => {
    const made = await copy(source);
    if (made) writeFileSync(out, made);
    return !!made;
  };

  // Interface textures are encoded lossless: their own kind, so a twin elsewhere never shares their copy.
  for (const path of textures) add(path, /[\\/]Interface[\\/]/i.test(path) ? 'texture1-lossless' : 'texture1', bytes(textureCopy));
  for (const path of icons) add(path, 'icon1', bytes(iconCopy));
  if (options.music) for (const path of music) add(path, 'music1', options.music);

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(8, cpus().length)) }, async () => {
      while (next < jobs.length) await jobs[next++]();
    })
  );
  return stats;
}

async function main(): Promise<void> {
  if (!liteAssetsWanted(process.env, process.argv)) {
    console.log('lite-assets: off (MU_LITE_ASSETS is not on); nothing written');
    return;
  }
  const arg = (name: string, fallback: string) => {
    const at = process.argv.indexOf(name);
    return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
  };
  const root = resolve(arg('--root', 'dist'));
  const music = ffmpegOpus(arg('--bitrate', '48k'));
  if (!music) console.warn('lite-assets: no ffmpeg with libopus on the PATH; the music gets no Opus copies');

  const cache = process.env.MU_LITE_CACHE || undefined;
  const { written, reused, kept, before, after } = await writeLiteAssets(root, { music, cache });
  const mb = (n: number) => (n / 1048576).toFixed(1);
  console.log(`lite-assets: ${root}\n  ${written} copies (${reused} from the cache), ${mb(before)} MB -> ${mb(after)} MB; ${kept} not smaller, left out`);
}

if (import.meta.main) await main();
