/** `CTLCODE_01BLOCKCHAR` / OpenMU `CharacterStatus.Banned`: the character may not enter the world. */
const BANNED = 0x01;

/** Whether a listed character is banned (its list status, `CharacterList`). */
export function isBannedCharacter(character: { Status: number }): boolean {
  return (character.Status & BANNED) !== 0;
}
