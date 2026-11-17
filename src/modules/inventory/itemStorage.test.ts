import { describe, expect, it } from 'vitest';
import {
  CHAOS_CARD_WIRE_STORAGE,
  localStorageOfWire,
  PET_TRAINER_WIRE_STORAGE,
  REFINERY_WIRE_STORAGE,
  SEED_WIRE_STORAGES,
  storageBan,
  StorageKind,
} from './itemStorage';
import { ItemGroup } from '../../controllers/item_rules/itemStats';
import { EN_TEXT } from '../../i18n';
import type { Item } from '../../ecs/world';

const item = (over: Partial<Item> = {}): Item => ({ group: ItemGroup.Sword, num: 0, lvl: 0, ...over });

describe('storageBan', () => {
  it('names a translated refusal per storage', () => {
    const questBox = item({ group: ItemGroup.Potion, num: 21, lvl: 0 });
    const pendant = item({ group: ItemGroup.Helper, num: 38 });

    expect(storageBan(StorageKind.Vault, questBox)).toBe('notify.cannotStore');
    expect(storageBan(StorageKind.Trade, pendant)).toBe('notify.cannotTrade');
    for (const kind of [StorageKind.Vault, StorageKind.Trade, StorageKind.PersonalShop]) {
      const key = storageBan(kind, questBox) ?? storageBan(kind, pendant);
      if (key) expect(EN_TEXT[key]).toBeDefined();
    }
  });

  it('lets an ordinary item through', () => {
    expect(storageBan(StorageKind.Vault, item())).toBeNull();
    expect(storageBan(StorageKind.Inventory, item({ group: ItemGroup.Potion, num: 21 }))).toBeNull();
  });
});

describe('localStorageOfWire', () => {
  // A gemstone put in Elpis's refinery vanished: its tray's byte was not mapped to the mix grid.
  it('lands every mix tray in the chaos machine grid', () => {
    for (const wire of [CHAOS_CARD_WIRE_STORAGE, PET_TRAINER_WIRE_STORAGE, REFINERY_WIRE_STORAGE, ...SEED_WIRE_STORAGES]) {
      expect(localStorageOfWire(wire), String(wire)).toBe(StorageKind.ChaosMachine);
    }
  });

  it('keeps the other storages as they are', () => {
    for (const kind of [StorageKind.Inventory, StorageKind.Trade, StorageKind.Vault, StorageKind.ChaosMachine, StorageKind.PersonalShop]) {
      expect(localStorageOfWire(kind)).toBe(kind);
    }
  });
});
