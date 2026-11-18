import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import type { UserConfig, UserConfigFnObject } from 'vite';
import viteConfig from '../../vite.config';
import { strayDebugLogs } from './distLogs';

const configFor = (command: 'build' | 'serve') =>
  (viteConfig as unknown as UserConfigFnObject)({ command, mode: command === 'build' ? 'production' : 'development' }) as UserConfig;

const SAMPLE = `
export function run(x: number) {
  console.log('drop', x);
  console.debug('packet', x);
  console.trace('here');
  console.info('kept');
  console.warn('kept');
  console.error('kept');
  return x;
}
`;

describe('production builds carry no debug logging', () => {
  it('the build minifies console.log, console.debug and console.trace away, and keeps the rest', async () => {
    const esbuild = configFor('build').esbuild;
    expect(esbuild).toBeTruthy();
    const out = await transform(SAMPLE, { ...(esbuild as object), loader: 'ts', minify: true });
    expect(strayDebugLogs(out.code)).toEqual([]);
    expect(out.code).toContain('console.warn(');
    expect(out.code).toContain('console.error(');
    expect(out.code).toContain('console.info(');
  });

  it('the dev server keeps every log', () => {
    expect(configFor('serve').esbuild).toBeUndefined();
  });

  it('the dist check finds a stray log, and not a mere reference to one', () => {
    expect(strayDebugLogs('a();console.log("x");console.debug(1)')).toEqual(['console.log(', 'console.debug(']);
    expect(strayDebugLogs('const l=console.log.bind(console);console.warn(1)')).toEqual([]);
  });
});

describe('production builds keep function names', () => {
  // The performance overlay names each ECS system by its function name; minified it read `uUt`.
  it('a system factory keeps its name through the minifier', async () => {
    const esbuild = configFor('build').esbuild;
    const out = await transform('export const RenderSystem = (world) => world;', { ...(esbuild as object), loader: 'ts', minify: true, format: 'esm' });
    // The binding is renamed; its `name` is set back to the original.
    expect(out.code).toContain('"RenderSystem")');
  });
});
