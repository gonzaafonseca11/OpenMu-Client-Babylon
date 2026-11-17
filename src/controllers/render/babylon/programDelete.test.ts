import { describe, expect, it, vi } from 'vitest';
import { getStateObject } from '@babylonjs/core/Engines/thinEngine.functions';
import { deferDeletingCompilingPrograms } from './programDelete';

type Ctx = { program: object; _name?: string; _isDisposed?: boolean };

/** A WebGL2 context whose programs finish compiling when told to, and an engine around it. */
function fakeEngine() {
  const done = new Set<object>();
  const gl = {
    TEXTURE_BINDING_3D: 1,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }),
    isContextLost: () => false,
    getProgramParameter: (p: object) => done.has(p),
  };
  const frameEnds: (() => void)[] = [];
  const deleted: Ctx[] = [];
  const engine = {
    _gl: gl,
    // Babylon's own delete: it also disposes whatever pipeline is cached under the context's name.
    _deletePipelineContext: vi.fn((c: Ctx) => {
      deleted.push(c);
      const cache = getStateObject(gl as never).cachedPipelines as unknown as Record<string, Ctx>;
      if (c._name && cache[c._name]) {
        cache[c._name]._isDisposed = true;
        delete cache[c._name];
      }
    }),
    onEndFrameObservable: { add: (f: () => void) => frameEnds.push(f) },
  };
  deferDeletingCompilingPrograms(engine as never);
  const cache = getStateObject(gl as never).cachedPipelines as unknown as Record<string, Ctx>;
  return { engine, done, deleted, cache, endFrame: () => frameEnds.forEach(f => f()) };
}

describe('deferred program delete', () => {
  it('waits for a compiling program before deleting it', () => {
    const { engine, done, deleted, endFrame } = fakeEngine();
    const old: Ctx = { program: {} };
    engine._deletePipelineContext(old as never);
    endFrame();
    expect(deleted).toEqual([]);
    done.add(old.program);
    endFrame();
    expect(deleted).toEqual([old]);
  });

  // The hero vanished on Enhanced: a map reload made a new program under the old one's name, and
  // the late delete of the old one disposed the new one from the cache, so it never read ready.
  it('leaves the newer program cached under the same name alone', () => {
    const { engine, done, cache, endFrame } = fakeEngine();
    const old: Ctx = { program: {}, _name: 'custom_2' };
    engine._deletePipelineContext(old as never);
    const fresh: Ctx = { program: {}, _name: 'custom_2' };
    cache.custom_2 = fresh;
    done.add(old.program);
    endFrame();
    expect(fresh._isDisposed).toBeUndefined();
    expect(cache.custom_2).toBe(fresh);
  });
});
