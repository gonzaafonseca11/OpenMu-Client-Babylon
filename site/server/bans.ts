import type { Sql } from 'postgres';

/**
 * Banned characters for the GM panel: OpenMU's `CharacterStatus` Banned (1), with the reason our
 * CharacterSpeedBanPlugIn records in `mu_plugins.character_ban` (openmu/plugins/GameLogic/Bans).
 */

export type BannedCharacter = { name: string; account: string; reason: string; bannedAt: string | null };

const BANNED = 1;

export async function bannedCharacters(sql: Sql): Promise<BannedCharacter[]> {
  const rows = await sql`
    SELECT c."Name" AS name, a."LoginName" AS account, b.reason, b.banned_at
    FROM data."Character" c JOIN data."Account" a ON a."Id" = c."AccountId"
    LEFT JOIN mu_plugins.character_ban b ON b.character_id = c."Id"
    WHERE c."CharacterStatus" = ${BANNED}
    ORDER BY b.banned_at DESC NULLS LAST, c."Name"`;
  return rows.map(r => ({
    name: String(r.name),
    account: String(r.account),
    reason: r.reason ? String(r.reason) : 'Sin motivo guardado (baneado a mano).',
    bannedAt: r.banned_at ? (r.banned_at as Date).toISOString() : null,
  }));
}

/** Why the ban cannot be lifted now, or null: OpenMU holds the account in memory while any of its characters plays. */
export function unbanBlocker(accountCharacters: readonly string[], online: readonly string[]): string | null {
  const playing = accountCharacters.find(name => online.some(o => o.toLowerCase() === name.toLowerCase()));
  return playing ? `${playing}, de la misma cuenta, está en el juego. Probá cuando salga.` : null;
}

/** The names of every character of the banned character's account, or null when it is not banned. */
export async function accountOfBanned(sql: Sql, name: string): Promise<string[] | null> {
  const rows = await sql`
    SELECT o."Name" AS name FROM data."Character" c JOIN data."Character" o ON o."AccountId" = c."AccountId"
    WHERE lower(c."Name") = lower(${name}) AND c."CharacterStatus" = ${BANNED}`;
  return rows.length ? rows.map(r => String(r.name)) : null;
}

export async function unbanCharacter(sql: Sql, name: string): Promise<{ name: string } | { error: string }> {
  return sql.begin('read write', async tx => {
    const [row] = await tx`
      UPDATE data."Character" SET "CharacterStatus" = 0
      WHERE lower("Name") = lower(${name}) AND "CharacterStatus" = ${BANNED}
      RETURNING "Id" AS id, "Name" AS name`;
    if (!row) return { error: `${name} no está baneado.` };
    await tx`DELETE FROM mu_plugins.character_ban WHERE character_id = ${row.id}`;
    return { name: String(row.name) };
  });
}
