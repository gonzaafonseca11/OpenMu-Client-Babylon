import { GreasedLineMesh } from '@babylonjs/core/Meshes/GreasedLine/greasedLineMesh';
import type { Buffer } from '@babylonjs/core/Buffers/buffer';

/**
 * GreasedLineMesh builds its four line buffers as `Buffer`s and hands the mesh vertex buffers
 * that only borrow them, so replacing or disposing those frees nothing: every `setPoints` and
 * every disposed line left four GPU buffers behind. This frees the old ones. See render/readme.md.
 */

export const GREASED_LINE_BUFFER_KINDS = [
  'grl_previousAndSide',
  'grl_nextAndCounters',
  'grl_widths',
  'grl_colorPointers',
] as const;

type Patched = { _createVertexBuffers(this: GreasedLineMesh): unknown };

function lineBuffers(mesh: GreasedLineMesh): (Buffer | undefined)[] {
  return GREASED_LINE_BUFFER_KINDS.map(
    kind => (mesh.getVertexBuffer(kind) as unknown as { _buffer?: Buffer } | null)?._buffer
  );
}

let installed = false;

export function installGreasedLineBufferRelease(): void {
  if (installed) return;
  installed = true;
  const proto = GreasedLineMesh.prototype as unknown as Patched;

  const create = proto._createVertexBuffers;
  proto._createVertexBuffers = function (this: GreasedLineMesh) {
    const old = lineBuffers(this);
    const result = create.call(this);
    const now = lineBuffers(this);
    old.forEach((b, i) => b && b !== now[i] && b.dispose());
    return result;
  };

  const lines = GreasedLineMesh.prototype;
  const dispose = lines.dispose;
  lines.dispose = function (this: GreasedLineMesh, ...args: Parameters<GreasedLineMesh['dispose']>) {
    const last = lineBuffers(this);
    dispose.apply(this, args);
    for (const b of last) b?.dispose();
  };
}
