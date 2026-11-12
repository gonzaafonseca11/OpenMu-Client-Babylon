/**
 * The Season 6 pool packets carry health, mana and shield in 16 bits, so a pool past 65535 arrives
 * wrapped (98335 shows as 32799). The server's own formulas (OpenMU `AttributeRelationship`, per
 * class family) give a floor the real maximum cannot be under, and the wrapped value is lifted by
 * whole turns of 65536 to the first value at or above it. Below 65536 nothing changes.
 */

const TURN = 65536;
/** The floor is taken a little low: berserker and similar can shave the maximum. */
const FLOOR_MARGIN = 0.85;

/** `[health: const, per level, per vitality], [mana: const, per level, per energy]`, by class number / 4. */
const FAMILY: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[] = [
  [[30, 1, 2], [0, 2, 2]], // Dark Wizard
  [[35, 2, 3], [10, 0.5, 1]], // Dark Knight
  [[39, 1, 2], [6, 1.5, 1.5]], // Elf
  [[57, 1, 2], [7, 1, 2]], // Magic Gladiator
  [[48.5, 1.5, 2], [15.5, 1, 1.5]], // Dark Lord: 38 + (energy - 15) * 1.5
  [[39, 1, 2], [6, 1.5, 1.7]], // Summoner
  [[57, 1.3, 2], [7, 1, 1.3]], // Rage Fighter
];

export type PoolStats = { charClass: number; level: number; str: number; agi: number; sta: number; eng: number; leadership: number };

/** The least each maximum can be with these base stats (no items, no buffs). */
export function poolFloors(s: PoolStats): { hp: number; mp: number; sd: number } {
  const [hp, mp] = FAMILY[Math.floor(s.charClass / 4)] ?? FAMILY[0];
  const lordCommand = Math.floor(s.charClass / 4) === 4 ? s.leadership : 0;
  return {
    hp: (hp[0] + hp[1] * s.level + hp[2] * s.sta) * FLOOR_MARGIN,
    mp: (mp[0] + mp[1] * s.level + mp[2] * s.eng) * FLOOR_MARGIN,
    sd: ((s.str + s.agi + s.sta + s.eng + lordCommand) * 1.2 + (s.level * s.level) / 30) * FLOOR_MARGIN,
  };
}

/** A wrapped maximum: the first value with the same low 16 bits at or above the floor. */
export function unwrapMaximum(wrapped: number, floor: number): number {
  if (wrapped >= TURN || floor <= wrapped) return wrapped;
  return wrapped + Math.ceil((floor - wrapped) / TURN) * TURN;
}

/** A wrapped current value: of the values with those low 16 bits up to the maximum, the nearest to the last one. */
export function unwrapCurrent(wrapped: number, last: number, max: number): number {
  if (wrapped >= TURN || max < TURN) return wrapped;
  // The pool is full: the server sends the maximum, so a wrong earlier guess cannot stick.
  if (wrapped === max % TURN) return max;
  let best = wrapped;
  for (let v = wrapped; v <= max; v += TURN) if (Math.abs(v - last) < Math.abs(best - last)) best = v;
  return best;
}
