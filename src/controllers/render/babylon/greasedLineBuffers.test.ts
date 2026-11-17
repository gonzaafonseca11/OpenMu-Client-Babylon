import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CreateGreasedLine } from '@babylonjs/core/Meshes/Builders/greasedLineBuilder';
import { GreasedLineMeshMaterialType } from '@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces';
import type { GreasedLineMesh } from '@babylonjs/core/Meshes/GreasedLine/greasedLineMesh';
import type { Buffer } from '@babylonjs/core/Buffers/buffer';
import '@babylonjs/core/Materials/GreasedLine/greasedLineSimpleMaterial';
import { GREASED_LINE_BUFFER_KINDS, installGreasedLineBufferRelease } from './greasedLineBuffers';

/**
 * GreasedLineMesh hands its four line buffers to the mesh as borrowed vertex buffers, so
 * neither `setPoints` (which builds four new ones) nor `dispose` frees the old ones: an item
 * crackle re-pointed every frame left ~110 GPU buffers a second behind (Chrome's GPU process
 * reached 7 GB over a long session).
 */
describe('GreasedLine buffer release', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    installGreasedLineBufferRelease();
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => engine.dispose());

  const line = () =>
    CreateGreasedLine(
      'line',
      { points: [[0, 0, 0, 1, 1, 1]], updatable: true },
      { width: 0.1, materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE },
      scene
    ) as GreasedLineMesh;

  const buffers = (mesh: GreasedLineMesh): Buffer[] =>
    GREASED_LINE_BUFFER_KINDS.map(kind => (mesh.getVertexBuffer(kind) as unknown as { _buffer: Buffer })._buffer);

  it('frees the four old line buffers when the points change', () => {
    const mesh = line();
    const old = buffers(mesh);
    mesh.setPoints([[0, 0, 0, 2, 2, 2]]);
    for (const b of old) expect(b.getBuffer()).toBeNull();
    for (const b of buffers(mesh)) expect(b.getBuffer()).not.toBeNull();
  });

  it('frees the line buffers with the mesh', () => {
    const mesh = line();
    const last = buffers(mesh);
    mesh.dispose();
    for (const b of last) expect(b.getBuffer()).toBeNull();
  });
});
