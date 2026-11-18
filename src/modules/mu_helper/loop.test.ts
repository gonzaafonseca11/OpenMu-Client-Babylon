import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../ecs/world';

vi.stubGlobal('location', { search: '', hostname: 'localhost', href: 'http://localhost/' });

// The setup file has loaded the loop and its modules already, so a vi.mock never reaches it:
// the module switch and the server-driven state are spied on and set on the real objects.
const watched: string[] = [];
const moduleSwitch = { on: false };
const mod = await import('../module');
vi.spyOn(mod, 'moduleOn').mockImplementation(id => id !== 'mu_helper' || moduleSwitch.on);
const helperState = await import('./state');
vi.spyOn(helperState, 'ensureMuHelperWatching').mockImplementation(() => void watched.push('watch'));
const on = {
  set module(v: boolean) {
    moduleSwitch.on = v;
  },
  helper: helperState.MuHelper as { active: boolean },
  state: helperState.MuHelperState as unknown as Record<string, unknown>,
};
const itemRules = await import('@/controllers/item_rules');
const realItemDef = itemRules.itemDef;
/** The item file row the pickup filter reads the drop's name from. */
vi.spyOn(itemRules, 'itemDef').mockImplementation((g, i) => (g === 6 && i === 4 ? ({ name: 'Guardian Shield' } as never) : realItemDef(g, i)));

const { updateMuHelperLoop, noteMonsterHit } = await import('./loop');
const { defaultMuHelperConfig } = await import('./config');
const { HeroSkills } = await import('../skills');
const { GameOptions } = await import('@/controllers/settings');

describe('updateMuHelperLoop', () => {
  it('does nothing while the mu_helper module is off', () => {
    updateMuHelperLoop({} as World, 1);
    expect(watched).toEqual([]);
  });

  it('lets go of the cast, the swing and the pickup it was on when switched off', () => {
    on.module = true;
    const hero = { transform: { pos: { x: 10, z: 10 } }, attributeSystem: { isAboveZero: () => false } };
    const world = {
      playerEntity: hero,
      mapIndex: 0,
      castRequest: { target: null, point: { x: 12, y: 12 } },
      attackTarget: {},
      pickupTarget: {},
    } as unknown as World;
    on.helper.active = true;
    updateMuHelperLoop(world, 0.1);
    on.helper.active = false;
    updateMuHelperLoop(world, 0.1);
    expect([world.castRequest, world.attackTarget, world.pickupTarget]).toEqual([null, null, null]);
  });

  /** One helper tick with `buff` in the first buff slot and the hero wearing `effects`: whether it cast. */
  function buffTick(buff: number, effects: number[]): boolean {
    on.module = true;
    on.state.config = { ...defaultMuHelperConfig(), buffs: [buff, 0, 0] };
    HeroSkills.setSkillList([{ index: 0, number: buff, level: 0 }]);
    const hero = {
      transform: { pos: { x: 10, z: 10 } },
      attributeSystem: { isAboveZero: () => false },
      buffs: new Set(effects),
    };
    const world = {
      playerEntity: hero,
      mapIndex: 0,
      castRequest: null,
      pickupTarget: null,
      netObjsQuery: { entities: [] },
      playersQuery: { entities: [] },
    } as unknown as World;
    on.helper.active = true;
    updateMuHelperLoop(world, 0.3);
    const cast = world.castRequest !== null;
    on.helper.active = false;
    updateMuHelperLoop(world, 0.3);
    return cast;
  }

  it('checks a buff by skill number, as BuffTarget does (MuHelper.cpp:490)', () => {
    // Attack Increase Strengthener shows as Greater Damage (eBuff_Attack, 1).
    expect(buffTick(420, [1])).toBe(false);
    expect(buffTick(420, [])).toBe(true);
    // Swell Life Proficiency shows as eBuff_Life (8).
    expect(buffTick(360, [8])).toBe(false);
  });

  it('never casts a skill BuffTarget does not list', () => {
    expect(buffTick(422, [])).toBe(false);
  });

  /** One helper tick with a drop next to the hero: what it sends the hero to pick up. */
  function pickupTick(pickupAsked: boolean): unknown {
    on.module = true;
    on.state.config = { ...defaultMuHelperConfig(), pickAllItems: true };
    const drop = {
      netId: 5,
      worldIndex: 0,
      transform: { pos: { x: 11, z: 10 } },
      droppedItem: { isMoney: false, group: 14, num: 0, pickupAsked },
    };
    const world = {
      playerEntity: { transform: { pos: { x: 10, z: 10 } }, attributeSystem: { isAboveZero: () => false } },
      mapIndex: 0,
      castRequest: null,
      pickupTarget: null,
      netObjsQuery: { entities: [drop] },
      playersQuery: { entities: [] },
    } as unknown as World;
    on.helper.active = true;
    updateMuHelperLoop(world, 0.3);
    const target = world.pickupTarget === (drop as unknown) ? 'drop' : world.pickupTarget;
    on.helper.active = false;
    updateMuHelperLoop(world, 0.3);
    return target;
  }

  it('asks for a drop once: after its pickup request it is left alone (DeleteItem, MuHelper.cpp:1252)', () => {
    expect(pickupTick(false)).toBe('drop');
    expect(pickupTick(true)).toBeNull();
  });

  /** Whether one tick goes for a lucky or plain Guardian Shield listed as `entry`, filters on or off. */
  function extraItemTick(entry: string, luck: boolean, filters: boolean): boolean {
    GameOptions.helperItemFilters = filters;
    on.module = true;
    on.state.config = { ...defaultMuHelperConfig(), pickExtraItems: true, extraItems: [entry] };
    const drop = {
      worldIndex: 0,
      transform: { pos: { x: 11, z: 10 } },
      droppedItem: { isMoney: false, group: 6, num: 4, item: { group: 6, num: 4, luck } },
    };
    const world = {
      playerEntity: { transform: { pos: { x: 10, z: 10 } }, attributeSystem: { isAboveZero: () => false } },
      mapIndex: 0,
      castRequest: null,
      pickupTarget: null,
      netObjsQuery: { entities: [drop] },
      playersQuery: { entities: [] },
    } as unknown as World;
    on.helper.active = true;
    updateMuHelperLoop(world, 0.3);
    const picked = world.pickupTarget === (drop as unknown);
    on.helper.active = false;
    updateMuHelperLoop(world, 0.3);
    GameOptions.helperItemFilters = false;
    return picked;
  }

  it('matches extra items by name only, as the original, until the player turns the filters on', () => {
    expect(extraItemTick('Guardian', false, false)).toBe(true);
    expect(extraItemTick('Guardian Shield +Luck', true, false)).toBe(false);
    expect(extraItemTick('Guardian Shield +Luck', true, true)).toBe(true);
    expect(extraItemTick('Guardian Shield +Luck', false, true)).toBe(false);
  });
});

describe('a helper that hits nothing', () => {
  // MATAVIEJAS swung Twisting Slash for 20 minutes in LaCleon: the server kept a walk the client
  // had stopped, so it looked for targets around another tile and hit none. A step resyncs it.

  function attackFor(seconds: number, hitEvery: number | null) {
    on.module = true;
    on.state.config = { ...defaultMuHelperConfig(), skills: [41, 0, 0] };
    HeroSkills.setSkillList([{ index: 0, number: 41, level: 0 }]);
    const mammoth = { netId: 647, npcType: 455, transform: { pos: { x: 180, z: 187 } } };
    const moveTo = { point: { x: 0, y: 0 }, handled: true, sendToServer: false };
    const hero = { transform: { pos: { x: 182, z: 187 } }, attributeSystem: { isAboveZero: () => false }, playerMoveTo: moveTo };
    const world = {
      playerEntity: hero,
      mapIndex: 0,
      castRequest: null,
      pickupTarget: null,
      netObjsQuery: { entities: [mammoth] },
      playersQuery: { entities: [] },
      getTerrainFlag: () => 0,
    } as unknown as World;
    on.helper.active = true;
    let walked = false;
    for (let t = 0; t < seconds; t += 0.25) {
      world.castRequest = null;
      if (hitEvery && Math.round(t * 4) % Math.round(hitEvery * 4) === 0) noteMonsterHit();
      updateMuHelperLoop(world, 0.25);
      if (moveTo.sendToServer) walked = true;
    }
    on.helper.active = false;
    updateMuHelperLoop(world, 0.25);
    return { walked, to: moveTo.point };
  }

  it('steps toward its target after 4 seconds without a single hit', () => {
    expect(attackFor(3, null).walked).toBe(false);
    expect(attackFor(5, null)).toEqual({ walked: true, to: { x: 180, y: 187 } });
  });

  it('stands and swings while the server keeps confirming hits', () => {
    expect(attackFor(10, 1).walked).toBe(false);
  });
});
