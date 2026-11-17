import { describe, expect, it } from 'vitest';
import { formatHeap, formatScene } from './memory';

describe('perf readout memory lines', () => {
  it('shows the page heap in MB, or a dash where the browser does not tell', () => {
    expect(formatHeap({ usedJSHeapSize: 512 * 1024 * 1024 })).toBe('512 MB');
    expect(formatHeap(undefined)).toBe('-');
  });

  it('counts the meshes, textures and materials the scene holds', () => {
    expect(formatScene({ meshes: { length: 1240 }, textures: { length: 310 }, materials: { length: 95 } })).toBe(
      '1240 / 310 / 95'
    );
    expect(formatScene(undefined)).toBe('-');
  });
});
