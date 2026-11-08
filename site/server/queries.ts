import type { Sql } from 'postgres';

/**
 * The site's reads from OpenMU's database. Read only: the site connects as a role that may only
 * SELECT these tables (install/cli/siteRole.ts). OpenMU's `AccountState`: Normal 0, Spectator 1,
 * GameMaster 2, GameMasterInvisible 3, Banned 4, TemporarilyBanned 5. A character's `CharacterStatus`:
 * Normal 0, Banned 1, GameMaster 32.
 */

export const RANKING_SIZE = 50;

export type RankedCharacter = { name: string; class: string; level: number; resets: number; kills: number };

export type OwnCharacter = RankedCharacter & {
  map: string;
  strength: number;
  agility: number;
  vitality: number;
  energy: number;
  leadership: number;
};

export type LoginRow = { id: string; hash: string; state: number };

/** A character's value of one stat attribute by its designation, 0 when it has none. */
const stat = (sql: Sql, designation: string) => sql`
  COALESCE((
    SELECT sa."Value" FROM data."StatAttribute" sa
    JOIN config."AttributeDefinition" ad ON ad."Id" = sa."DefinitionId"
    WHERE sa."CharacterId" = c."Id" AND ad."Designation" = ${designation}
    LIMIT 1
  ), 0)
`;

const toRanked = (r: Record<string, unknown>): RankedCharacter => ({
  name: String(r.name),
  class: String(r.class),
  level: Math.round(Number(r.level)),
  resets: Math.round(Number(r.resets)),
  kills: Number(r.kills),
});

/** Players only: no Game Masters, spectators, banned accounts or characters, bots or templates. */
async function ranking(sql: Sql, by: 'kills' | 'resets'): Promise<RankedCharacter[]> {
  const rows = await sql`
    SELECT * FROM (
      SELECT c."Name" AS name, cc."Name" AS class, c."PlayerKillCount" AS kills,
             ${stat(sql, 'Level')} AS level, ${stat(sql, 'Resets')} AS resets
      FROM data."Character" c
      JOIN data."Account" a ON a."Id" = c."AccountId"
      JOIN config."CharacterClass" cc ON cc."Id" = c."CharacterClassId"
      WHERE a."State" = 0 AND c."CharacterStatus" = 0 AND NOT a."IsBot" AND NOT a."IsTemplate"
    ) ranked
    WHERE ${by === 'kills' ? sql`kills > 0` : sql`true`}
    ORDER BY ${by === 'kills' ? sql`kills DESC, resets DESC` : sql`resets DESC, level DESC`}, name
    LIMIT ${RANKING_SIZE}
  `;
  return rows.map(toRanked);
}

export const pkRanking = (sql: Sql) => ranking(sql, 'kills');
export const resetRanking = (sql: Sql) => ranking(sql, 'resets');

/** The account a login names, case-insensitive like OpenMU's own lookup, or null. */
export async function findAccount(sql: Sql, login: string): Promise<LoginRow | null> {
  const [row] = await sql`
    SELECT "Id" AS id, "PasswordHash" AS hash, "State" AS state FROM data."Account"
    WHERE lower("LoginName") = lower(${login}) AND NOT "IsBot" AND NOT "IsTemplate"
    LIMIT 1
  `;
  return row ? { id: String(row.id), hash: String(row.hash), state: Number(row.state) } : null;
}

export type SessionRow = { login: string; hash: string; state: number; chatBanUntil: Date | null };

/** The account behind a session: its password hash (the session must still match it), state and chat ban. */
export async function accountHash(sql: Sql, id: string): Promise<SessionRow | null> {
  const [row] = await sql`
    SELECT "LoginName" AS login, "PasswordHash" AS hash, "State" AS state, "ChatBanUntil" AS ban
    FROM data."Account" WHERE "Id" = ${id}
  `;
  return row ? { login: String(row.login), hash: String(row.hash), state: Number(row.state), chatBanUntil: (row.ban as Date | null) ?? null } : null;
}

/** The account's character names, for "talk as" in the chat. */
export async function characterNames(sql: Sql, accountId: string): Promise<string[]> {
  const rows = await sql`SELECT "Name" AS name FROM data."Character" WHERE "AccountId" = ${accountId} ORDER BY "CharacterSlot"`;
  return rows.map(r => String(r.name));
}

export async function accountCharacters(sql: Sql, accountId: string): Promise<OwnCharacter[]> {
  const rows = await sql`
    SELECT c."Name" AS name, cc."Name" AS class, c."PlayerKillCount" AS kills,
           COALESCE(m."Name", '') AS map,
           ${stat(sql, 'Level')} AS level, ${stat(sql, 'Resets')} AS resets,
           ${stat(sql, 'Base Strength')} AS strength, ${stat(sql, 'Base Agility')} AS agility,
           ${stat(sql, 'Base Vitality')} AS vitality, ${stat(sql, 'Base Energy')} AS energy,
           ${stat(sql, 'Base Leadership')} AS leadership
    FROM data."Character" c
    JOIN config."CharacterClass" cc ON cc."Id" = c."CharacterClassId"
    LEFT JOIN config."GameMapDefinition" m ON m."Id" = c."CurrentMapId"
    WHERE c."AccountId" = ${accountId}
    ORDER BY c."CharacterSlot"
  `;
  return rows.map(r => ({
    ...toRanked(r),
    map: String(r.map),
    strength: Math.round(Number(r.strength)),
    agility: Math.round(Number(r.agility)),
    vitality: Math.round(Number(r.vitality)),
    energy: Math.round(Number(r.energy)),
    leadership: Math.round(Number(r.leadership)),
  }));
}
