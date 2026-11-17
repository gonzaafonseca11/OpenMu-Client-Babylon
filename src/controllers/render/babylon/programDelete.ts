import type { Engine } from '@babylonjs/core/Engines/engine';
import { getStateObject } from '@babylonjs/core/Engines/thinEngine.functions';
import { devQuery } from '@/core/devSeams';

type PipelineContext = Parameters<Engine['_deletePipelineContext']>[0];
type Named = { program?: WebGLProgram | null; _name?: string };

/**
 * ANGLE cannot abandon a link in flight, so deleting a program that is still
 * compiling blocks the GPU process until the compile ends: a second or more
 * when a map is unloaded right after it loaded. Such a program is deleted
 * once its compile completes instead. See render/readme.md.
 */
export function deferDeletingCompilingPrograms(engine: Engine): void {
  // `?programDelete=now`: delete at once, as Babylon does, for the A/B.
  if (devQuery('programDelete') === 'now') return;

  const gl = engine._gl;
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (!parallel) return;

  const remove = engine._deletePipelineContext.bind(engine);
  const waiting: PipelineContext[] = [];
  const cached = getStateObject(gl).cachedPipelines as Record<string, unknown>;

  const compiling = (context: PipelineContext): boolean => {
    const program = (context as unknown as Named).program;
    return !!program && !gl.isContextLost() && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR);
  };

  engine._deletePipelineContext = (context: PipelineContext) => {
    if (compiling(context)) waiting.push(context);
    else remove(context);
  };

  engine.onEndFrameObservable.add(() => {
    for (let i = waiting.length - 1; i >= 0; i--) {
      const context = waiting[i];
      if (compiling(context)) continue;
      // Babylon's delete disposes the pipeline cached under this name, by now maybe a newer one.
      const named = context as unknown as Named;
      if (named._name && cached[named._name] !== context) named._name = undefined;
      remove(context);
      waiting.splice(i, 1);
    }
  });
}
