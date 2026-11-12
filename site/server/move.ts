import type { Sql } from 'postgres';

/**
 * "Mover personaje" on Mi cuenta: a stuck character of the player's own, logged out, goes to a town's
 * spawn area (OpenMU's spawn gates for these maps), the way a warp would put it there.
 */

export const TOWNS = {
  lorencia: { name: 'Lorencia', map: 0, x1: 133, y1: 118, x2: 151, y2: 135 },
  noria: { name: 'Noria', map: 3, x1: 171, y1: 108, x2: 177, y2: 117 },
  devias: { name: 'Devias', map: 2, x1: 197, y1: 35, x2: 218, y2: 50 },
  elvenland: { name: 'Elvenland', map: 51, x1: 51, y1: 224, x2: 54, y2: 227 },
} as const;

export type Town = keyof typeof TOWNS;

export const isTown = (value: unknown): value is Town => typeof value === 'string' && Object.hasOwn(TOWNS, value);

/** A random tile of the town's spawn area. */
export function townSpot(town: Town, random = Math.random): { map: number; x: number; y: number } {
  const t = TOWNS[town];
  const pick = (from: number, to: number) => from + Math.floor(random() * (to - from + 1));
  return { map: t.map, x: pick(t.x1, t.x2), y: pick(t.y1, t.y2) };
}

/** Moves the account's character; the caller has checked that none of the account's characters is in the game. */
export async function moveCharacter(sql: Sql, accountId: string, name: string, town: Town): Promise<{ name: string; town: string } | { error: string }> {
  const spot = townSpot(town);
  const [row] = await sql`
    UPDATE data."Character" c SET "CurrentMapId" = m."Id", "PositionX" = ${spot.x}, "PositionY" = ${spot.y}
    FROM config."GameMapDefinition" m
    WHERE m."Number" = ${spot.map} AND c."AccountId" = ${accountId} AND lower(c."Name") = lower(${name})
    RETURNING c."Name" AS name`;
  return row ? { name: String(row.name), town: TOWNS[town].name } : { error: 'Ese personaje no es de tu cuenta.' };
}
