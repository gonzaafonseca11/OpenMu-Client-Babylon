/** Ours: what the page and the scene hold, to see what grows over a long session (readme). */

const MB = 1024 * 1024;

type Heap = { usedJSHeapSize: number };
type Counted = { length: number };
type SceneHold = { meshes: Counted; textures: Counted; materials: Counted };

/** The JS heap in use; `performance.memory` is Chrome only. */
export function formatHeap(memory: Heap | undefined): string {
  return memory ? `${Math.round(memory.usedJSHeapSize / MB)} MB` : '-';
}

/** Meshes / textures / materials in the scene. */
export function formatScene(scene: SceneHold | undefined): string {
  return scene ? `${scene.meshes.length} / ${scene.textures.length} / ${scene.materials.length}` : '-';
}

/** `performance.memory`, where the browser has it. */
export function pageHeap(): Heap | undefined {
  return (performance as Performance & { memory?: Heap }).memory;
}
