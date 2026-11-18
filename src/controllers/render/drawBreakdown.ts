import type { Scene } from './babylon/exports';

/**
 * Where a frame's draw calls go, for the performance overlay (perfOverlay.ts): per render pass, and
 * which objects fill the active mesh list. Hooked only while the overlay is open.
 */

type Named = { name: string; parent: Named | null };
type CountedTarget = {
  name: string;
  onBeforeRenderObservable: { add(fn: () => void): unknown };
  onAfterRenderObservable: { add(fn: () => void): unknown };
};

/** `passes` line: the main pass is the frame's draws less every render target's. */
export function formatPasses(frameDraws: number, perPass: ReadonlyMap<string, number>): string {
  let others = 0;
  for (const n of perPass.values()) others += n;
  const parts = [`main ${Math.max(0, Math.round(frameDraws - others))}`];
  for (const [name, n] of perPass) parts.push(`${name} ${Math.round(n)}`);
  return `passes     ${parts.join('  ')}`;
}

/** A mesh's source: the name of the root of its tree, without the copy number. */
export function sourceOf(mesh: Named): string {
  let root = mesh;
  while (root.parent) root = root.parent;
  return root.name.replace(/(\s*#\d+|_\d+)$/, '');
}

/** The `count` sources with the most meshes, most first. */
export function topSources(meshes: Iterable<Named>, count: number): [string, number][] {
  const by = new Map<string, number>();
  for (const m of meshes) {
    const s = sourceOf(m);
    by.set(s, (by.get(s) ?? 0) + 1);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
}

const SMOOTHING = 0.1;
const hooked = new WeakSet<object>();
/** Draws per render target, smoothed like the frame's own count. */
const perPass = new Map<string, number>();
const thisFrame = new Map<string, number>();

const drawCalls = (scene: Scene) =>
  (scene.getEngine() as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;

/** Hooks every render target the scene has now (shadow maps, glow, custom targets); call at each refresh. */
export function hookRenderTargets(scene: Scene): void {
  for (const t of scene.textures as unknown as CountedTarget[]) {
    if (hooked.has(t) || !('renderList' in t) || !t.onBeforeRenderObservable) continue;
    hooked.add(t);
    let before = 0;
    t.onBeforeRenderObservable.add(() => (before = drawCalls(scene)));
    t.onAfterRenderObservable.add(() => {
      const name = (t.name || 'target').replace(/(\s*#\d+|_\d+)$/, '');
      thisFrame.set(name, (thisFrame.get(name) ?? 0) + drawCalls(scene) - before);
    });
  }
}

/** Folds the frame's per-target draws into the averages; call once per frame. */
export function samplePasses(): void {
  for (const name of new Set([...perPass.keys(), ...thisFrame.keys()])) {
    const prev = perPass.get(name) ?? 0;
    perPass.set(name, prev + ((thisFrame.get(name) ?? 0) - prev) * SMOOTHING);
  }
  thisFrame.clear();
}

export function passesLine(frameDraws: number): string {
  return formatPasses(frameDraws, perPass);
}

export function resetPasses(): void {
  perPass.clear();
  thisFrame.clear();
}
