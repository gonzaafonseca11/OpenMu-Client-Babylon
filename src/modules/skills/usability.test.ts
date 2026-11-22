import { describe, expect, it, vi } from 'vitest';
import { runInAction } from 'mobx';
import { CharacterClassNumber } from '../../core/types';
import { InventoryConstants } from '../../core/inventoryConstants';
import type { Item } from '../../ecs/world';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { ItemsDatabase } = await import('@versions/shared/items/itemsDatabase');
const { skillUsability, weaponSkillEquipped } = await import('./usability');
const { HeroSkills } = await import('./state');
const { Hero } = await import('../hero');

const TRIPLE_SHOT = 24;
const STRENGTHENER = 414;
const MASTERY = 418;

/** A bow that carries Triple Shot, with its skill, in the left hand (or nothing there). */
function holdBow(held: boolean): void {
  const bow = ItemsDatabase.all().find(i => i.Group === 4 && i.Skill === TRIPLE_SHOT);
  if (!bow) throw new Error('no Triple Shot bow in the item table');
  runInAction(() => {
    Hero.items[InventoryConstants.LeftHandSlot] = held ? ({ group: 4, num: bow.Index, hasSkill: true } as unknown as Item) : null;
  });
}

// IsNonWeaponSkillOrIsSkillEquipped checks the weapon of the master skill's base (CSItemOption.cpp:602-640).
describe('a master skill of a weapon skill', () => {
  it('needs the weapon that carries its base skill, the Mastery as the Strengthener', () => {
    for (const skill of [TRIPLE_SHOT, STRENGTHENER, MASTERY]) {
      holdBow(false);
      expect(weaponSkillEquipped(skill)).toBe(false);
      holdBow(true);
      expect(weaponSkillEquipped(skill)).toBe(true);
    }
  });

  it('is cast only with that weapon in hand (NewUIMainFrameWindow.cpp:2389)', () => {
    runInAction(() => {
      Hero.charClass = CharacterClassNumber.HighElf;
      Hero.level = 400;
    });
    HeroSkills.setSkillList([{ index: 0, number: STRENGTHENER, level: 0 }]);
    holdBow(false);
    expect(skillUsability(STRENGTHENER).blocks).toContain('weapon');
    holdBow(true);
    expect(skillUsability(STRENGTHENER).blocks).not.toContain('weapon');
  });
});

// Ours: the server (openmu ResetSkillsPlugIn) waives level and energy once a character made a real reset.
describe('a character past its first real reset', () => {
  it('casts a learned skill whatever its level and energy, while the server says so', async () => {
    const { skillDefinition } = await import('@versions/shared/skills/skillsDatabase');
    const { onSkillsPacket } = await import('./resetWaiver');
    const num = [...Array(600).keys()].find(n => {
      const d = skillDefinition(n);
      return !!d && d.level > 1 && d.energy > 100 && !isWeaponSkillOf(n);
    }) ?? 0;
    expect(num).toBeGreaterThan(0);
    runInAction(() => {
      Hero.level = 1;
      Hero.eng = 20;
    });
    HeroSkills.setSkillList([{ index: 0, number: num, level: 0 }]);
    expect(skillUsability(num).blocks).toEqual(expect.arrayContaining(['level', 'energy']));

    onSkillsPacket(new Uint8Array([1]));
    expect(skillUsability(num).blocks).not.toContain('level');
    expect(skillUsability(num).blocks).not.toContain('energy');

    onSkillsPacket(new Uint8Array([0]));
    expect(skillUsability(num).blocks).toContain('level');
  });
});

function isWeaponSkillOf(n: number): boolean {
  return ItemsDatabase.all().some(i => i.Group <= 5 && i.Skill === n);
}
