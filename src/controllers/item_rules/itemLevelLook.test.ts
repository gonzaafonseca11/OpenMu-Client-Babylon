import { describe, expect, it } from 'vitest';
import { itemLevelName } from './itemLevelLook';
import { itemIconUrl } from '../assets/itemIconPack';

const POTION = 14;
const BOX_OF_LUCK = 11;

const name = (lvl: number) => itemLevelName(POTION, BOX_OF_LUCK, lvl, 'Box of Luck');
const icon = (lvl: number) => itemIconUrl({ group: POTION, num: BOX_OF_LUCK, lvl });

// Loch's Feather +1 is the Crest of Monarch, named without a level (`GetItemName`, ZzzInventory.cpp).
describe("Loch's Feather by level", () => {
  it('names level 1 the Crest of Monarch and keeps the feather at 0', () => {
    expect(itemLevelName(13, 14, 0, "Loch's Feather")).toBe("Loch's Feather");
    expect(itemLevelName(13, 14, 1, "Loch's Feather")).toBe('Crest of Monarch');
    expect(itemIconUrl({ group: 13, num: 14, lvl: 1 })).toBe('/items/item_13_14_1.png');
  });
});

// The Spirit is the Dark Horse's at level 0 and the Dark Raven's at 1 (`GetItemName`, ZzzInventory.cpp).
describe('Spirit by level', () => {
  it('names the Dark Horse and the Dark Raven spirits without a level', () => {
    expect(itemLevelName(13, 31, 0, 'Spirit')).toBe('Spirit of Dark Horse');
    expect(itemLevelName(13, 31, 1, 'Spirit')).toBe('Spirit of Dark Raven');
  });
});

describe('Box of Luck by level', () => {
  it('names each level as the item it is', () => {
    expect(name(0)).toBe('Box of Luck');
    expect(name(1)).toBe('Star of Sacred Birth');
    expect(name(6)).toBe('Gold Medal');
    expect(name(13)).toBe('Heart of Dark Lord');
    expect(name(15)).toBe('Red Lucky Pouch');
  });

  it('counts the Box of Kundun from +1 at level 8', () => {
    expect(name(8)).toBe('Box of Kundun +1');
    expect(name(12)).toBe('Box of Kundun +5');
  });

  it('keeps the box and its level where the original has no other name', () => {
    expect(name(4)).toBe('Box of Luck +4');
  });

  it('draws each level with its own icon, not the pack tint', () => {
    expect(icon(0)).toBe('/items/item_14_11_0.png');
    for (const lvl of [1, 2, 4, 8, 10, 12, 14]) {
      expect(icon(lvl)).toBe(`/items/item_14_11_${lvl}.png`);
    }
  });
});
