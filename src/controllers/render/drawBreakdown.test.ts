import { describe, expect, it } from 'vitest';
import { formatPasses, sourceOf, topSources } from './drawBreakdown';

type Node = { name: string; parent: Node | null };
const node = (name: string, parent: Node | null = null): Node => ({ name, parent });

describe('the draw breakdown on the performance overlay', () => {
  // 337 active meshes made 1417 draws a frame: the passes each mesh is drawn in tell where they go.
  it('splits a frame between its passes, the main pass taking what the others did not', () => {
    expect(formatPasses(1400, new Map([['shadowMap', 500], ['glow', 300]]))).toBe('passes     main 600  shadowMap 500  glow 300');
    expect(formatPasses(100, new Map())).toBe('passes     main 100');
  });

  it('names a mesh by the root of its tree, the trailing numbers dropped so copies count together', () => {
    const root = node('Monster12.glb #4071');
    expect(sourceOf(node('body', node('armature', root)))).toBe('Monster12.glb');
    expect(sourceOf(node('props-Object07_3'))).toBe('props-Object07');
  });

  it('lists the sources with the most active meshes first', () => {
    const a = node('Player #1');
    const b = node('Player #2');
    const m = node('Monster12.glb #9');
    const meshes = [node('x', a), node('y', a), node('z', b), node('w', m)];
    expect(topSources(meshes, 2)).toEqual([
      ['Player', 3],
      ['Monster12.glb', 1],
    ]);
  });
});
