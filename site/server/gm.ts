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
} as const;
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
  return `Adicional: ${what}`;
}

/**
 * Items of one group (sword, armor, gloves...) a class family may use. A family is a class number
 * divided by 4 (Dark Wizard 0, Soul Master 2, Grand Master 3 are family 0); -1 is any class.
 * An item with no class listed (rings, jewels) fits every class.
 */
export async function browseItems(sql: Sql, group: number, family: number): Promise<ItemChoice[]> {
  const rows = await sql`
    SELECT d."Id" AS id, d."Name" AS name, d."Group" AS g, d."Number" AS n, d."MaximumItemLevel" AS max, d."Width" AS w, d."Height" AS h,
           d."SkillId" IS NOT NULL AS skill, d."Durability" AS dur
    FROM config."ItemDefinition" d
    WHERE d."Group" = ${group} AND (${family} < 0
      OR NOT EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q WHERE q."ItemDefinitionId" = d."Id")
      OR EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q JOIN config."CharacterClass" c ON c."Id" = q."CharacterClassId"
                 WHERE q."ItemDefinitionId" = d."Id" AND c."Number" / 4 = ${family}))
    ORDER BY d."DropLevel", d."Number"
  `;
  return rows.map(r => ({ id: String(r.id), name: String(r.name), group: Number(r.g), number: Number(r.n), maxLevel: Number(r.max), width: Number(r.w), height: Number(r.h), hasSkill: Boolean(r.skill), durability: Number(r.dur) }));
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
    return [{ id: String(r.id), kind, number: Number(r.number), label: optionLabel(kind, attr, Number(r.number)), maxLevel: Math.min(Number(r.max) || 4, 4) }];
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
