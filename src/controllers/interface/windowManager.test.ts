import { describe, expect, it, vi } from 'vitest';
import { autorun, runInAction } from 'mobx';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), setSfxListener: vi.fn(), clearSfxListener: vi.fn() }));
vi.mock('../sound/listener', () => sfx);

const { MuWindows } = await import('./windowManager');
const { AppState } = await import('./uiState');
const { playUiSound } = await import('@/controllers/sound/sfx');

describe('MuWindows open state', () => {
  it('starts closed and reacts to the first open of an unseen id', () => {
    const seen: boolean[] = [];
    const stop = autorun(() => seen.push(MuWindows.isOpen('test_window')));

    MuWindows.setOpen('test_window', true);
    MuWindows.setOpen('test_window', false);
    stop();

    expect(seen).toEqual([false, true, false]);
  });
});

// HideAll (NewUISystem.cpp:1608), run on a map change (WSclient.cpp:2285).
describe('MuWindows.closeAll', () => {
  it('runs every stacked closer and drops every open flag', () => {
    const closed: string[] = [];
    MuWindows.setOpen('inventory', true);
    MuWindows.register('vault', undefined, () => void closed.push('vault'));
    MuWindows.register('chat', undefined, () => false);
    MuWindows.register('trade', undefined, () => void closed.push('trade'));

    MuWindows.closeAll();

    expect(closed).toEqual(['trade', 'vault']);
    expect(MuWindows.isOpen('inventory')).toBe(false);
    for (const id of ['vault', 'chat', 'trade']) MuWindows.unregister(id);
  });

  // HideAll calls each window's Hide (ClosingProcess), which plays nothing; Escape's click is the window's own.
  it('closes in silence', () => {
    MuWindows.register('quick_command', undefined, () => playUiSound('click'));
    sfx.playSfx.mockClear();
    MuWindows.closeAll();
    expect(sfx.playSfx).not.toHaveBeenCalled();
    MuWindows.closeTop();
    expect(sfx.playSfx).toHaveBeenCalled();
    MuWindows.unregister('quick_command');
  });

  it('reaches the windows the hidden interface unmounted', () => {
    const closed: string[] = [];
    MuWindows.register('vault', undefined, () => void closed.push('vault'));
    runInAction(() => (AppState.hudHidden = true));
    MuWindows.unregister('vault');
    MuWindows.closeAll();
    expect(closed).toEqual(['vault']);
    MuWindows.closeAll();
    expect(closed).toEqual(['vault']);
    runInAction(() => (AppState.hudHidden = false));
  });
});

// Ours: a window the player left on top of another (a saved drag) opens beside it, not over it.
describe('MuWindows.keepApart', () => {
  const box = (left: number, top: number, width: number, height: number) =>
    ({ getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) }) as unknown as HTMLElement;

  it('moves a window opened over another to its left, or to its right without room there', () => {
    MuWindows.register('inventory_t', undefined, undefined, box(600, 100, 285, 640));
    MuWindows.register('shop_t', undefined, undefined, box(560, 120, 285, 640));
    MuWindows.keepApart('shop_t');
    expect(MuWindows.placement('shop_t')).toMatchObject({ x: 600 - 285 - 4, y: 120 });

    MuWindows.register('vault_t', undefined, undefined, box(40, 100, 100, 200));
    MuWindows.register('left_t', undefined, undefined, box(0, 100, 100, 200));
    MuWindows.keepApart('left_t');
    expect(MuWindows.placement('left_t')).toMatchObject({ x: 40 + 100 + 4, y: 100 });
    for (const id of ['inventory_t', 'shop_t', 'vault_t', 'left_t']) MuWindows.unregister(id);
  });

  it('leaves a window alone when it overlaps nothing, or barely', () => {
    MuWindows.register('a_t', undefined, undefined, box(0, 0, 285, 640));
    MuWindows.register('b_t', undefined, undefined, box(280, 0, 285, 640));
    MuWindows.keepApart('b_t');
    expect(MuWindows.placement('b_t').x).toBeNull();
    for (const id of ['a_t', 'b_t']) MuWindows.unregister(id);
  });
});
