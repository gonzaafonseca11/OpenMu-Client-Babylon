import type { Sql } from 'postgres';
import { InventoryConstants } from '../../src/core/inventoryConstants';
import { findFreeSlot, type Footprint } from '../../src/modules/inventory/inventoryFit';

/**
 * The GM panel's item maker (site/readme.md): search an item, pick its options, and the item lands
 * in an offline character's bag. Writes only data."Item" and data."ItemOptionLink".
 */

/** The option types the panel offers, by their `config."ItemOptionType"` name. */
export const OPTION_KINDS = {
  'Excellent Option': 'excellent',
  'Luck (Critical Damage Chance 5%)': 'luck',
  Option: 'option',
  'Wing Option': 'wing',
  'Black Fenrir Option': 'fenrir',
  'Blue Fenrir Option': 'fenrir',
  'Gold Fenrir Option': 'fenrir',
} as const;

/** The Horn of Fenrir's kinds, by option number: one kind per horn, Gold being several lines. */
export const FENRIR = { 1: 'Negro (Destroy): +daño', 2: 'Azul (Protect): -daño recibido', 4: 'Dorado (Illusion): +daño, +vida, +maná' } as const;
export type OptionKind = (typeof OPTION_KINDS)[keyof typeof OPTION_KINDS];

export type ItemOption = { id: string; kind: OptionKind; number: number; label: string; maxLevel: number };
export type ItemChoice = { id: string; name: string; group: number; number: number; maxLevel: number; width: number; height: number; hasSkill: boolean; durability: number };
export type Picked = { id: string; level: number };

/** Classic durability growth per item level (ZzzInventory CalcMaxDurability); excellent adds 15, the byte caps at 255. */
export function durabilityFor(base: number, level: number, excellent: boolean): number {
  const steps = [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 17, 21, 26, 32, 39, 47];
  return Math.min(255, base + (steps[level] ?? 47) + (excellent ? 15 : 0));
}

/** The options to store, or why not: only the item's own, one "Option" line at most, levels in range. */
export function checkOptions(available: readonly ItemOption[], picked: readonly Picked[]): { links: { option: ItemOption; level: number }[] } | { error: string } {
  const byId = new Map(available.map(o => [o.id, o]));
  const links: { option: ItemOption; level: number }[] = [];
  for (const p of picked) {
    const option = byId.get(p.id);
    if (!option) return { error: 'Esa opción no es de este ítem.' };
    if (links.some(l => l.option.id === option.id)) continue;
    const level = option.kind === 'option' ? Math.trunc(Number(p.level)) : 0;
    if (option.kind === 'option' && !(level >= 1 && level <= option.maxLevel)) return { error: `La opción va de 1 a ${option.maxLevel}.` };
    links.push({ option, level });
  }
  if (links.filter(l => l.option.kind === 'option').length > 1) return { error: 'Elegí una sola opción adicional.' };
  if (new Set(links.filter(l => l.option.kind === 'fenrir').map(l => l.option.number)).size > 1) return { error: 'Elegí un solo tipo de Fenrir.' };
  return { links };
}

const LABELS: Record<string, string> = {
  'Money Drop Amount Rate': 'Zen +40%',
  'Defense Rate (PvM)': 'Tasa de defensa +10%',
  'Damage Reflection': 'Refleja daño 5%',
  'Armor Damage Decrease': 'Reduce daño 4%',
  'Maximum Mana': 'Maná máximo +4%',
  'Maximum Health': 'Vida máxima +4%',
  'Excellent Damage Chance': 'Daño excelente +10%',
  'Attack Speed': 'Velocidad de ataque +7',
  'Mana After Monster Kill': 'Maná al matar monstruo',
  'Health After Monster Kill': 'Vida al matar monstruo',
};

/** A plain Spanish name for an option, from what it raises. */
export function optionLabel(kind: OptionKind, attribute: string | null, number: number): string {
  if (kind === 'luck') return 'Luck (crítico +5%)';
  const what = attribute ?? `#${number}`;
  if (kind === 'excellent') return LABELS[what] ?? what;
  if (kind === 'wing') return `Ala: ${what}`;
  if (kind === 'fenrir') return FENRIR[number as keyof typeof FENRIR] ?? `Fenrir #${number}`;
  return `Adicional: ${what}`;
}

/**
 * Items of one group (sword, armor, gloves...) a class family may use. A family is a class number
 * divided by 4 (Dark Wizard 0, Soul Master 2, Grand Master 3 are family 0); -1 is any class.
 * An item with no class listed (rings, jewels) fits every class.
 */
/** What the panel's "type" list asks for: an item group, wings or orbs (both group 12), or full armor sets. */
export type Browse = number | 'wings' | 'orbs' | 'sets' | 'jewelry' | 'pets';

export function parseBrowse(value: string | null): Browse | null {
  if (value === 'wings' || value === 'orbs' || value === 'sets' || value === 'jewelry' || value === 'pets') return value;
  const n = Number(value);
  return value !== null && value !== '' && Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
}

/** A set is named by its armor: "Venom Mist Armor" is the "Venom Mist" set. */
export const setName = (armor: string) => armor.replace(/\s+(Armor|Robe|Suit)$/i, '');

export async function browseItems(sql: Sql, browse: Browse, family: number): Promise<ItemChoice[]> {
  const group = browse === 'sets' ? 8 : typeof browse === 'number' ? browse : browse === 'jewelry' || browse === 'pets' ? 13 : 12;
  // Wings are the group 12 items worn in a slot; orbs, jewels and the rest have none.
  // Group 13 splits by name: rings and pendants, then pets and the rest.
  const slot =
    browse === 'wings' ? sql`AND d."ItemSlotId" IS NOT NULL`
    : browse === 'orbs' ? sql`AND d."ItemSlotId" IS NULL`
    : browse === 'jewelry' ? sql`AND d."Name" ~* '(ring|pendant)'`
    : browse === 'pets' ? sql`AND d."Name" !~* '(ring|pendant)'`
    : sql``;
  const rows = await sql`
    SELECT d."Id" AS id, d."Name" AS name, d."Group" AS g, d."Number" AS n, d."MaximumItemLevel" AS max, d."Width" AS w, d."Height" AS h,
           d."SkillId" IS NOT NULL AS skill, d."Durability" AS dur
    FROM config."ItemDefinition" d
    WHERE d."Group" = ${group} ${slot} AND (${family} < 0
      OR NOT EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q WHERE q."ItemDefinitionId" = d."Id")
      OR EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q JOIN config."CharacterClass" c ON c."Id" = q."CharacterClassId"
                 WHERE q."ItemDefinitionId" = d."Id" AND c."Number" / 4 = ${family}))
    ORDER BY d."DropLevel", d."Number"
  `;
  return rows.map(r => ({ id: String(r.id), name: browse === 'sets' ? `Set ${setName(String(r.name))}` : String(r.name), group: Number(r.g), number: Number(r.n), maxLevel: Number(r.max), width: Number(r.w), height: Number(r.h), hasSkill: Boolean(r.skill), durability: Number(r.dur) }));
}

/** The same choice on another piece: options match by kind and number (excellent 1-6, luck, the extra option). */
export function matchOptions(from: readonly ItemOption[], picked: readonly Picked[], to: readonly ItemOption[]): Picked[] {
  return picked.flatMap(p => {
    const o = from.find(x => x.id === p.id);
    const twin = o && to.find(x => x.kind === o.kind && x.number === o.number);
    return twin ? [{ id: twin.id, level: Math.min(p.level, twin.maxLevel) }] : [];
  });
}

/**
 * A full armor set: the helm, armor, pants, gloves and boots (groups 7-11) that share the armor's
 * number, each with the options picked on the armor. Stops at the first piece that does not fit.
 */
export async function giveSet(sql: Sql, req: GiveRequest): Promise<{ given: string[] } | { error: string }> {
  const [armor] = await sql`SELECT "Number" AS n, "GameConfigurationId" AS cfg FROM config."ItemDefinition" WHERE "Id" = ${req.definitionId} AND "Group" = 8`;
  if (!armor) return { error: 'Ese set no existe.' };
  const pieces = await sql`SELECT "Id" AS id FROM config."ItemDefinition" WHERE "Number" = ${armor.n} AND "GameConfigurationId" = ${armor.cfg} AND "Group" BETWEEN 7 AND 11 ORDER BY "Group"`;
  const armorOptions = await itemOptions(sql, req.definitionId);
  const given: string[] = [];
  for (const piece of pieces) {
    const id = String(piece.id);
    const options = id === req.definitionId ? req.options : matchOptions(armorOptions, req.options, await itemOptions(sql, id));
    const result = await giveItem(sql, { ...req, definitionId: id, options });
    if ('error' in result) return { error: given.length ? `${result.error} Ya entregué: ${given.join(', ')}.` : result.error };
    given.push(result.name);
  }
  return { given };
}

export async function itemOptions(sql: Sql, definitionId: string): Promise<ItemOption[]> {
  const rows = await sql`
    SELECT o."Id" AS id, t."Name" AS type, o."Number" AS number, ad."Designation" AS attr,
           (SELECT max(ol."Level") FROM config."ItemOptionOfLevel" ol WHERE ol."IncreasableItemOptionId" = o."Id") AS max
    FROM config."ItemDefinitionItemOptionDefinition" l
    JOIN config."IncreasableItemOption" o ON o."ItemOptionDefinitionId" = l."ItemOptionDefinitionId"
    JOIN config."ItemOptionType" t ON t."Id" = o."OptionTypeId"
    LEFT JOIN config."PowerUpDefinition" p ON p."Id" = o."PowerUpDefinitionId"
    LEFT JOIN config."AttributeDefinition" ad ON ad."Id" = p."TargetAttributeId"
    WHERE l."ItemDefinitionId" = ${definitionId}
    ORDER BY t."Name", o."Number"
  `;
  return rows.flatMap(r => {
    const kind = OPTION_KINDS[String(r.type) as keyof typeof OPTION_KINDS];
    if (!kind) return [];
    const attr = r.attr == null ? null : String(r.attr);
    return [{ id: String(r.id), kind, number: Number(r.number), label: optionLabel(kind, attr, Number(r.number)), maxLevel: Math.min(Number(r.max) || 1, 4) }];
  });
}

export type GiveRequest = { character: string; definitionId: string; level: number; skill: boolean; options: Picked[] };

/** Puts the item in the character's bag; the caller has checked the character is offline. */
export async function giveItem(sql: Sql, req: GiveRequest): Promise<{ slot: number; name: string } | { error: string }> {
  const [def] = await sql`
    SELECT "Id" AS id, "Name" AS name, "MaximumItemLevel" AS max, "Width" AS w, "Height" AS h, "SkillId" IS NOT NULL AS skill, "Durability" AS dur
    FROM config."ItemDefinition" WHERE "Id" = ${req.definitionId}
  `;
  if (!def) return { error: 'No existe ese ítem.' };
  const level = Math.trunc(Number(req.level));
  if (!(level >= 0 && level <= Number(def.max))) return { error: `Este ítem va de +0 a +${def.max}.` };
  const checked = checkOptions(await itemOptions(sql, req.definitionId), req.options ?? []);
  if ('error' in checked) return checked;

  return sql.begin('read write', async tx => {
    const [ch] = await tx`SELECT "InventoryId" AS inv FROM data."Character" WHERE lower("Name") = lower(${req.character}) FOR UPDATE`;
    if (!ch?.inv) return { error: `El personaje "${req.character}" no existe. Revisá cómo está escrito.` };
    const placed = await tx`
      SELECT i."ItemSlot" AS slot, d."Width" AS w, d."Height" AS h FROM data."Item" i
      JOIN config."ItemDefinition" d ON d."Id" = i."DefinitionId"
      WHERE i."ItemStorageId" = ${ch.inv} AND i."ItemSlot" > ${InventoryConstants.LastEquippableItemSlotIndex} AND i."ItemSlot" < ${InventoryConstants.FirstStoreItemSlotIndex}
    `;
    const occupied: Footprint[] = placed.map(r => ({ slot: Number(r.slot), width: Number(r.w), height: Number(r.h) }));
    const slot = findFreeSlot(occupied, InventoryConstants.InventoryRows, Number(def.w), Number(def.h));
    if (slot < 0) return { error: `No hay lugar en el inventario (necesita ${def.w}x${def.h}).` };

    const excellent = checked.links.some(l => l.option.kind === 'excellent');
    const ordered = checked.links.some(l => l.option.kind === 'wing');
    const itemId = crypto.randomUUID();
    await tx`
      INSERT INTO data."Item" ("Id", "ItemStorageId", "DefinitionId", "ItemSlot", "Durability", "Level", "HasSkill", "SocketCount", "StorePrice", "PetExperience")
      VALUES (${itemId}, ${ch.inv}, ${def.id}, ${slot}, ${durabilityFor(Number(def.dur), level, excellent)}, ${level}, ${Boolean(req.skill) && Boolean(def.skill)}, 0, NULL, 0)
    `;
    // Wings keep their options in order (Index), as OpenMU's own /item writes them; others use 0.
    const sorted = [...checked.links].sort((a, b) => ['luck', 'option', 'wing', 'excellent'].indexOf(a.option.kind) - ['luck', 'option', 'wing', 'excellent'].indexOf(b.option.kind));
    for (const [i, l] of sorted.entries()) {
      await tx`INSERT INTO data."ItemOptionLink" ("Id", "ItemOptionId", "ItemId", "Level", "Index") VALUES (${crypto.randomUUID()}, ${l.option.id}, ${itemId}, ${l.level}, ${ordered ? i : 0})`;
    }
    return { slot, name: String(def.name) };
  });
}

/* ------------------------------------------------------------ stat editor */

/** What the stat editor reads and writes. `leadership` is null for classes without Command. */
export type CharacterStats = { name: string; class: string; classNumber: number; classes: { number: number; name: string }[]; level: number; resets: number; strength: number; agility: number; vitality: number; energy: number; leadership: number | null; points: number; zen: number };

const STAT_DESIGNATIONS = { level: 'Level', resets: 'Resets', strength: 'Base Strength', agility: 'Base Agility', vitality: 'Base Vitality', energy: 'Base Energy', leadership: 'Base Leadership' } as const;
export const LIMITS = { level: [1, 400], resets: [0, 100000], stat: [1, 32500], points: [0, 2_000_000_000], zen: [0, 2_000_000_000] } as const;

/** Experience a character holds at the start of a level: OpenMU's table, `10(n+9)n^2` plus the 1000x part past 255, n = level - 1. */
export function experienceForLevel(level: number): number {
  const n = level - 1;
  const high = n > 255 ? 1000 * (n - 255 + 9) * (n - 255) ** 2 : 0;
  return 10 * (n + 9) * n * n + high;
}

/** The values to store, or why not. */
export function checkStats(s: Record<string, unknown>, hasLeadership: boolean): Omit<CharacterStats, 'name' | 'class' | 'classNumber' | 'classes'> | { error: string } {
  const read = (key: string, [min, max]: readonly [number, number], label: string): number | string => {
    const v = Number(s[key]);
    return Number.isInteger(v) && v >= min && v <= max ? v : `${label} va de ${min.toLocaleString('es-AR')} a ${max.toLocaleString('es-AR')}.`;
  };
  const out = {
    level: read('level', LIMITS.level, 'El nivel'),
    resets: read('resets', LIMITS.resets, 'Los resets'),
    strength: read('strength', LIMITS.stat, 'La fuerza'),
    agility: read('agility', LIMITS.stat, 'La agilidad'),
    vitality: read('vitality', LIMITS.stat, 'La vitalidad'),
    energy: read('energy', LIMITS.stat, 'La energía'),
    leadership: hasLeadership ? read('leadership', LIMITS.stat, 'El comando') : null,
    points: read('points', LIMITS.points, 'Los puntos libres'),
    zen: read('zen', LIMITS.zen, 'El zen'),
  };
  const bad = Object.values(out).find(v => typeof v === 'string');
  return bad ? { error: bad as string } : (out as Omit<CharacterStats, 'name' | 'class' | 'classNumber' | 'classes'>);
}

async function statRows(sql: Sql, name: string) {
  const [ch] = await sql`
    SELECT c."Id" AS id, c."Name" AS name, cc."Name" AS class, cc."Number" AS cnum, c."LevelUpPoints" AS points, c."InventoryId" AS inv, COALESCE(s."Money", 0) AS zen
    FROM data."Character" c JOIN config."CharacterClass" cc ON cc."Id" = c."CharacterClassId"
    LEFT JOIN data."ItemStorage" s ON s."Id" = c."InventoryId"
    WHERE lower(c."Name") = lower(${name})
  `;
  if (!ch) return null;
  const rows = await sql`
    SELECT ad."Designation" AS d, sa."Value" AS v FROM data."StatAttribute" sa
    JOIN config."AttributeDefinition" ad ON ad."Id" = sa."DefinitionId"
    WHERE sa."CharacterId" = ${ch.id} AND ad."Designation" IN ${sql(Object.values(STAT_DESIGNATIONS))}
  `;
  const values = new Map(rows.map(r => [String(r.d), Math.round(Number(r.v))]));
  // Its evolutions: the classes of the same family (class number / 4), e.g. Dark Wizard, Soul Master, Grand Master.
  const family = await sql`SELECT "Id" AS id, "Number" AS number, "Name" AS name FROM config."CharacterClass" WHERE "Number" / 4 = ${Math.floor(Number(ch.cnum) / 4)} ORDER BY "Number"`;
  const classes = family.map(r => ({ id: String(r.id), number: Number(r.number), name: String(r.name) }));
  return { ch, values, classes };
}

export async function readStats(sql: Sql, name: string): Promise<CharacterStats | null> {
  const found = await statRows(sql, name);
  if (!found) return null;
  const { ch, values, classes } = found;
  const v = (k: keyof typeof STAT_DESIGNATIONS) => values.get(STAT_DESIGNATIONS[k]) ?? 0;
  return {
    name: String(ch.name), class: String(ch.class), classNumber: Number(ch.cnum), classes: classes.map(({ number, name }) => ({ number, name })), level: v('level'), resets: v('resets'),
    strength: v('strength'), agility: v('agility'), vitality: v('vitality'), energy: v('energy'),
    leadership: values.has(STAT_DESIGNATIONS.leadership) ? v('leadership') : null,
    points: Number(ch.points), zen: Number(ch.zen),
  };
}

/** Writes the stats; the caller has checked the character is offline. */
export async function writeStats(sql: Sql, name: string, body: Record<string, unknown>): Promise<CharacterStats | { error: string }> {
  const found = await statRows(sql, name);
  if (!found) return { error: `El personaje "${name}" no existe. Revisá cómo está escrito.` };
  const { ch, values, classes } = found;
  const checked = checkStats(body, values.has(STAT_DESIGNATIONS.leadership));
  if ('error' in checked) return checked;
  const wanted = body.classNumber === undefined ? Number(ch.cnum) : Number(body.classNumber);
  const newClass = classes.find(c => c.number === wanted);
  if (!newClass) return { error: 'Esa clase no es una evolución de este personaje.' };
  await sql.begin('read write', async tx => {
    for (const [key, designation] of Object.entries(STAT_DESIGNATIONS)) {
      const value = checked[key as keyof typeof checked];
      if (value === null || !values.has(designation)) continue;
      await tx`
        UPDATE data."StatAttribute" sa SET "Value" = ${value} FROM config."AttributeDefinition" ad
        WHERE ad."Id" = sa."DefinitionId" AND sa."CharacterId" = ${ch.id} AND ad."Designation" = ${designation}
      `;
    }
    const exp = checked.level === values.get(STAT_DESIGNATIONS.level) ? null : experienceForLevel(checked.level);
    await tx`UPDATE data."Character" SET "LevelUpPoints" = ${checked.points}, "CharacterClassId" = ${newClass.id} WHERE "Id" = ${ch.id}`;
    if (exp !== null) await tx`UPDATE data."Character" SET "Experience" = ${exp} WHERE "Id" = ${ch.id}`;
    if (ch.inv) await tx`UPDATE data."ItemStorage" SET "Money" = ${checked.zen} WHERE "Id" = ${ch.inv}`;
  });
  return (await readStats(sql, name)) ?? { error: 'No se pudo leer de nuevo.' };
}

/**
 * Teaches the character every skill its class learns from a scroll or orb (groups 12 and 15), the
 * ones a player buys and reads; weapon, pet and master-tree skills come from the game itself.
 * The caller has checked the character is offline. Returns how many were new.
 */
export async function learnAllSkills(sql: Sql, name: string): Promise<{ added: number; total: number } | { error: string }> {
  return sql.begin('read write', async tx => {
    const [ch] = await tx`SELECT "Id" AS id, "CharacterClassId" AS cls FROM data."Character" WHERE lower("Name") = lower(${name})`;
    if (!ch) return { error: `El personaje "${name}" no existe. Revisá cómo está escrito.` };
    const skills = await tx`
      SELECT s."Id" AS id FROM config."Skill" s
      WHERE s."MasterDefinitionId" IS NULL
        AND EXISTS (SELECT 1 FROM config."SkillCharacterClass" q WHERE q."SkillId" = s."Id" AND q."CharacterClassId" = ${ch.cls})
        AND EXISTS (SELECT 1 FROM config."ItemDefinition" d WHERE d."SkillId" = s."Id" AND d."Group" IN (12, 15))
        AND NOT EXISTS (SELECT 1 FROM data."SkillEntry" e WHERE e."CharacterId" = ${ch.id} AND e."SkillId" = s."Id")
    `;
    for (const s of skills) await tx`INSERT INTO data."SkillEntry" ("Id", "SkillId", "CharacterId", "Level") VALUES (${crypto.randomUUID()}, ${s.id}, ${ch.id}, 0)`;
    const [{ total }] = await tx`SELECT count(*)::int AS total FROM data."SkillEntry" WHERE "CharacterId" = ${ch.id}`;
    return { added: skills.length, total: Number(total) };
  });
}

/** Who is in the game now, from OpenMU's own API; null when it cannot be asked (then nothing is written). */
export async function onlinePlayers(apiUrl: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { playersList?: unknown };
    return Array.isArray(body.playersList) ? body.playersList.map(String) : null;
  } catch {
    return null;
  }
}
