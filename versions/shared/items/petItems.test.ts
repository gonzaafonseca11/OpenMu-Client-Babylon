import { describe, expect, it } from 'vitest';
import { DARK_RAVEN, DARK_RAVEN_SLOT, PET_GROUP, ravenEquipped } from './petItems';

// A Dark Lord wears the raven in the second hand (EQUIPMENT_WEAPON_LEFT, slot 1, where OpenMU keeps it):
// read from slot 0, the pet window said it was not equipped and the bar showed no commands.
describe('ravenEquipped', () => {
  const raven = { group: PET_GROUP, num: DARK_RAVEN };

  it('finds the raven in slot 1', () => {
    expect(DARK_RAVEN_SLOT).toBe(1);
    expect(ravenEquipped([null, raven])).toBe(true);
  });

  it('is false for a raven in the weapon slot or another item there', () => {
    expect(ravenEquipped([raven, null])).toBe(false);
    expect(ravenEquipped([null, { group: 6, num: 5 }])).toBe(false);
  });
});
