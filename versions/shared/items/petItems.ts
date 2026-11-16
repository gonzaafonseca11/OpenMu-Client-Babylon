/** Item group the pet slot draws from. */
export const PET_GROUP = 13;

export const GUARDIAN_ANGEL = 0;
export const IMP = 1;
export const HORN_OF_UNIRIA = 2;
export const HORN_OF_DINORANT = 3;
export const DARK_HORSE = 4;
export const DARK_RAVEN = 5;
/** Where a Dark Lord wears the raven: the second hand (`EQUIPMENT_WEAPON_LEFT`, OpenMU's slot 1). */
export const DARK_RAVEN_SLOT = 1;

/** Whether the equipment holds a Dark Raven in its slot (`Hero->m_pPet` in the original). */
export function ravenEquipped(items: readonly ({ group: number; num: number } | null | undefined)[]): boolean {
  const item = items[DARK_RAVEN_SLOT];
  return !!item && item.group === PET_GROUP && item.num === DARK_RAVEN;
}
/**
 * `MODEL_HORN_OF_FENRIR`. One item number, four mounts: the horn's option
 * bits pick the red / blue / black / gold model (`GetFenrirType`,
 * ZzzCharacter.cpp:98-108) - see `fenrirVariant` in pets.ts.
 */
export const HORN_OF_FENRIR = 37;

/**
 * The six follower pets of `w_PetProcess` - the ones `SetCharacterAppearance`
 * hands to `CreatePet` instead of `CreateMount` (ZzzCharacter.cpp:12992-12999).
 * They are not ridden and not link-rendered: each is a world object holding
 * station on its owner, and the appearance spends byte 16's top three bits
 * naming which one it is.
 */
export const DEMON = 64;
export const SPIRIT_OF_GUARDIAN = 65;
export const PET_RUDOLF = 67;
export const PET_PANDA = 80;
export const PET_UNICORN = 106;
export const PET_SKELETON = 123;
