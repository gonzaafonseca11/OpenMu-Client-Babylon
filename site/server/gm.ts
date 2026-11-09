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
  'Socket Option': 'socket',
} as const;

/** Seed sphere elements, by `SubOptionType`, and each one's options by number (Socket.cs, SocketSystem.cs). */
const SOCKETS: Record<number, [string, string[]]> = {
  0: ['Fuego', ['Daño/magia según nivel', 'Velocidad de ataque', 'Daño máximo', 'Daño mínimo', 'Daño', 'Menos AG usado']],
  1: ['Agua', ['Tasa de defensa', 'Defensa', 'Defensa del escudo', 'Reduce daño', 'Refleja daño']],
  2: ['Hielo', ['Vida al matar monstruo', 'Maná al matar monstruo', 'Daño de habilidad', 'Tasa de ataque', 'Durabilidad']],
  3: ['Viento', ['Recuperación de vida', 'Vida máxima', 'Maná máximo', 'Recuperación de maná', 'AG máximo', 'Recuperación de AG']],
  4: ['Rayo', ['Daño excelente', 'Probabilidad de excelente', 'Daño crítico', 'Probabilidad de crítico']],
  5: ['Tierra', ['Vida máxima']],
};
/** Seed sphere levels (1-5) and the most slots the packet carries (ItemSerializerHelper.cs): Mu Bardo gives every socket item 5. */
const SPHERE_LEVELS = 5;
const MAX_SOCKETS = 5;

/** The Horn of Fenrir's kinds, by option number: one kind per horn, Gold being several lines. */
export const FENRIR = { 1: 'Negro (Destroy): +daño', 2: 'Azul (Protect): -daño recibido', 4: 'Dorado (Illusion): +daño, +vida, +maná' } as const;
export type OptionKind = (typeof OPTION_KINDS)[keyof typeof OPTION_KINDS] | 'ancient';

/**
 * An item option the panel offers. An 'ancient' one is an ancient set the item belongs to: its id is the
 * config."ItemOfItemSet" row, `bonus` its stat bonus option (level 1 = +5, 2 = +10).
 */
export type ItemOption = { id: string; kind: OptionKind; number: number; element?: number; label: string; maxLevel: number; bonus?: string | null; bonusLabel?: string };

/** The ancient set to store, or why not: one of the item's own, bonus level 0-2 (0 when the set has no bonus). */
export function checkAncient(available: readonly ItemOption[], picked: Picked | null | undefined): { ancient: ItemOption | null; level: number } | { error: string } {
  if (!picked?.id) return { ancient: null, level: 0 };
  const ancient = available.find(o => o.id === picked.id && o.kind === 'ancient');
  if (!ancient) return { error: 'Ese set ancient no es de este ítem.' };
  const level = ancient.bonus ? Math.trunc(Number(picked.level)) : 0;
  if (!(level >= 0 && level <= 2)) return { error: 'El bonus ancient es +5 o +10.' };
  return { ancient, level };
}
export type ItemChoice = { id: string; name: string; group: number; number: number; maxLevel: number; width: number; height: number; hasSkill: boolean; durability: number; sockets: number };
export type Picked = { id: string; level: number };

/**
 * The socket slots to store, one entry per slot: an empty id is an empty slot. At most the item's own
 * slot count, each option one of the item's socket options, each sphere level 1-5.
 */
export function checkSockets(available: readonly ItemOption[], slots: readonly Picked[], maxSockets: number): { slots: ({ option: ItemOption; level: number } | null)[] } | { error: string } {
  if (slots.length > Math.min(maxSockets, MAX_SOCKETS)) return { error: maxSockets ? `Este ítem tiene ${maxSockets} sockets como máximo.` : 'Este ítem no lleva sockets.' };
  const out: ({ option: ItemOption; level: number } | null)[] = [];
  for (const s of slots) {
    if (!s.id) { out.push(null); continue; }
    const option = available.find(o => o.id === s.id && o.kind === 'socket');
    if (!option) return { error: 'Ese socket no es de este ítem.' };
    const level = Math.trunc(Number(s.level));
    if (!(level >= 1 && level <= SPHERE_LEVELS)) return { error: `El nivel de la esfera va de 1 a ${SPHERE_LEVELS}.` };
    out.push({ option, level });
  }
  return { slots: out };
}

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
    if (!option || option.kind === 'socket' || option.kind === 'ancient') return { error: 'Esa opción no es de este ítem.' };
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
export function optionLabel(kind: OptionKind, attribute: string | null, number: number, element = 0): string {
  if (kind === 'luck') return 'Luck (crítico +5%)';
  if (kind === 'socket') {
    const [name, lines] = SOCKETS[element] ?? [`Elemento ${element}`, []];
    return `${name}: ${lines[number] ?? attribute ?? `#${number}`}`;
  }
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
export type Browse = number | 'wings' | 'orbs' | 'sets' | 'jewelry' | 'pets' | 'ancients';

export function parseBrowse(value: string | null): Browse | null {
  if (value === 'wings' || value === 'orbs' || value === 'sets' || value === 'jewelry' || value === 'pets' || value === 'ancients') return value;
  const n = Number(value);
  return value !== null && value !== '' && Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
}

/** A set is named by its armor: "Venom Mist Armor" is the "Venom Mist" set. */
export const setName = (armor: string) => armor.replace(/\s+(Armor|Robe|Suit)$/i, '');

export async function browseItems(sql: Sql, browse: Browse, family: number): Promise<ItemChoice[]> {
  if (browse === 'ancients') return ancientSets(sql, family);
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
           d."SkillId" IS NOT NULL AS skill, d."Durability" AS dur, d."MaximumSockets" AS sockets
    FROM config."ItemDefinition" d
    WHERE d."Group" = ${group} ${slot} AND (${family} < 0
      OR NOT EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q WHERE q."ItemDefinitionId" = d."Id")
      OR EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q JOIN config."CharacterClass" c ON c."Id" = q."CharacterClassId"
                 WHERE q."ItemDefinitionId" = d."Id" AND c."Number" / 4 = ${family}))
    ORDER BY d."DropLevel", d."Number"
  `;
  return rows.map(r => ({ id: String(r.id), name: browse === 'sets' ? `Set ${setName(String(r.name))}` : String(r.name), group: Number(r.g), number: Number(r.n), maxLevel: Number(r.max), width: Number(r.w), height: Number(r.h), hasSkill: Boolean(r.skill), durability: Number(r.dur), sockets: Number(r.sockets) > 0 ? MAX_SOCKETS : 0 }));
}

/** The same choice on another piece: options match by kind and number (excellent 1-6, luck, the extra option). */
export function matchOptions(from: readonly ItemOption[], picked: readonly Picked[], to: readonly ItemOption[]): Picked[] {
  return picked.flatMap(p => {
    const o = from.find(x => x.id === p.id);
    const twin = o && to.find(x => x.kind === o.kind && x.number === o.number && x.element === o.element);
    return twin ? [{ id: twin.id, level: Math.min(p.level, twin.maxLevel) }] : [];
  });
}

/** Socket slots for another piece: the same element and option, empty where that piece lacks it. */
const matchSockets = (from: readonly ItemOption[], slots: readonly Picked[], to: readonly ItemOption[]): Picked[] =>
  slots.map(s => (s.id ? matchOptions(from, [s], to)[0] : undefined) ?? { id: '', level: 0 });

/**
 * A full armor set: the helm, armor, pants, gloves and boots (groups 7-11) that share the armor's
 * number, each with the options picked on the armor. Stops at the first piece that does not fit.
 */
export async function giveSet(sql: Sql, req: GiveRequest): Promise<{ given: string[] } | { error: string }> {
  const [armor] = await sql`SELECT "Number" AS n, "GameConfigurationId" AS cfg FROM config."ItemDefinition" WHERE "Id" = ${req.definitionId} AND "Group" = 8`;
  if (!armor) return giveAncientSet(sql, req);
  const pieces = await sql`SELECT "Id" AS id FROM config."ItemDefinition" WHERE "Number" = ${armor.n} AND "GameConfigurationId" = ${armor.cfg} AND "Group" BETWEEN 7 AND 11 ORDER BY "Group"`;
  const armorOptions = await itemOptions(sql, req.definitionId);
  const given: string[] = [];
  for (const piece of pieces) {
    const id = String(piece.id);
    const own = id === req.definitionId ? null : await itemOptions(sql, id);
    const options = own ? matchOptions(armorOptions, req.options, own) : req.options;
    const sockets = own ? matchSockets(armorOptions, req.sockets ?? [], own) : req.sockets;
    // The same ancient set on each piece, matched by the set's name.
    const setOf = req.ancient?.id ? armorOptions.find(o => o.id === req.ancient?.id) : undefined;
    const twin = own && setOf ? own.find(o => o.kind === 'ancient' && o.label === setOf.label) : undefined;
    const ancient = !own ? req.ancient : twin ? { id: twin.id, level: twin.bonus ? req.ancient?.level ?? 0 : 0 } : null;
    const result = await giveItem(sql, { ...req, definitionId: id, options, sockets, ancient });
    if ('error' in result) return { error: given.length ? `${result.error} Ya entregué: ${given.join(', ')}.` : result.error };
    given.push(result.name);
  }
  return { given };
}

/**
 * A whole ancient set (Hyon, Vicious...): every item of the set group, weapons and jewelry included,
 * each as that set's ancient with the bonus level asked. `definitionId` is the config."ItemSetGroup" id;
 * the item level is capped at each piece's own maximum (a ring stays +0).
 */
async function giveAncientSet(sql: Sql, req: GiveRequest): Promise<{ given: string[] } | { error: string }> {
  const pieces = await sql`
    SELECT s."Id" AS id, s."ItemDefinitionId" AS def, d."MaximumItemLevel" AS max, s."BonusOptionId" IS NOT NULL AS bonus
    FROM config."ItemOfItemSet" s JOIN config."ItemDefinition" d ON d."Id" = s."ItemDefinitionId"
    WHERE s."ItemSetGroupId" = ${req.definitionId} AND s."AncientSetDiscriminator" <> 0
    ORDER BY d."Group", d."Number"
  `;
  if (!pieces.length) return { error: 'Ese set no existe.' };
  const given: string[] = [];
  for (const p of pieces) {
    const level = Math.min(Math.trunc(Number(req.level)) || 0, Number(p.max));
    const ancient = { id: String(p.id), level: p.bonus ? Number(req.ancient?.level ?? 0) : 0 };
    const options = piecePicks(await itemOptions(sql, String(p.def)), req.extras ?? {});
    const result = await giveItem(sql, { ...req, definitionId: String(p.def), level, options, sockets: [], ancient });
    if ('error' in result) return { error: given.length ? `${result.error} Ya entregué: ${given.join(', ')}.` : result.error };
    given.push(result.name);
  }
  return { given };
}

/** What a whole ancient set asks of every piece: the excellent options by label, luck, its first extra option at the top level. */
export type SetExtras = { excellent?: string[]; luck?: boolean; option?: boolean };

/** The options of one piece for `extras`: only what that piece has (a ring has no luck, a pendant other excellents). */
export function piecePicks(available: readonly ItemOption[], extras: SetExtras): Picked[] {
  const extra = available.find(o => o.kind === 'option');
  const wanted = new Set(extras.excellent ?? []);
  return [
    ...available.filter(o => o.kind === 'excellent' && wanted.has(o.label)).map(o => ({ id: o.id, level: 0 })),
    ...(extras.luck ? available.filter(o => o.kind === 'luck').map(o => ({ id: o.id, level: 0 })) : []),
    ...(extras.option && extra ? [{ id: extra.id, level: extra.maxLevel }] : []),
  ];
}

/** Every excellent option any piece of an ancient set has, once per label (the id is the label: pieces differ). */
export async function setExcellents(sql: Sql, setId: string): Promise<ItemOption[]> {
  const pieces = await sql`SELECT DISTINCT "ItemDefinitionId" AS def FROM config."ItemOfItemSet" WHERE "ItemSetGroupId" = ${setId} AND "AncientSetDiscriminator" <> 0`;
  const seen = new Map<string, ItemOption>();
  for (const p of pieces) {
    for (const o of await itemOptions(sql, String(p.def))) if (o.kind === 'excellent' && !seen.has(o.label)) seen.set(o.label, { ...o, id: o.label });
  }
  return [...seen.values()];
}

/** Ancient sets for a class family: a set shows when any of its pieces fits the family. */
async function ancientSets(sql: Sql, family: number): Promise<ItemChoice[]> {
  const rows = await sql`
    SELECT g."Id" AS id, g."Name" AS name FROM config."ItemSetGroup" g
    WHERE EXISTS (
      SELECT 1 FROM config."ItemOfItemSet" s JOIN config."ItemDefinition" d ON d."Id" = s."ItemDefinitionId"
      WHERE s."ItemSetGroupId" = g."Id" AND s."AncientSetDiscriminator" <> 0 AND (${family} < 0
        OR EXISTS (SELECT 1 FROM config."ItemDefinitionCharacterClass" q JOIN config."CharacterClass" c ON c."Id" = q."CharacterClassId"
                   WHERE q."ItemDefinitionId" = d."Id" AND c."Number" / 4 = ${family})))
    ORDER BY g."Name"
  `;
  return rows.map(r => ({ id: String(r.id), name: `Set ${r.name}`, group: -1, number: 0, maxLevel: 15, width: 0, height: 0, hasSkill: true, durability: 0, sockets: 0 }));
}

export async function itemOptions(sql: Sql, definitionId: string): Promise<ItemOption[]> {
  const rows = await sql`
    SELECT o."Id" AS id, t."Name" AS type, o."Number" AS number, o."SubOptionType" AS element, ad."Designation" AS attr,
           (SELECT max(ol."Level") FROM config."ItemOptionOfLevel" ol WHERE ol."IncreasableItemOptionId" = o."Id") AS max
    FROM config."ItemDefinitionItemOptionDefinition" l
    JOIN config."IncreasableItemOption" o ON o."ItemOptionDefinitionId" = l."ItemOptionDefinitionId"
    JOIN config."ItemOptionType" t ON t."Id" = o."OptionTypeId"
    LEFT JOIN config."PowerUpDefinition" p ON p."Id" = o."PowerUpDefinitionId"
    LEFT JOIN config."AttributeDefinition" ad ON ad."Id" = p."TargetAttributeId"
    WHERE l."ItemDefinitionId" = ${definitionId}
    ORDER BY t."Name", o."Number"
  `;
  const options: ItemOption[] = rows.flatMap(r => {
    const kind = OPTION_KINDS[String(r.type) as keyof typeof OPTION_KINDS];
    if (!kind) return [];
    const attr = r.attr == null ? null : String(r.attr);
    const element = Number(r.element) || 0;
    const maxLevel = kind === 'socket' ? SPHERE_LEVELS : Math.min(Number(r.max) || 1, 4);
    return [{ id: String(r.id), kind, number: Number(r.number), element, label: optionLabel(kind, attr, Number(r.number), element), maxLevel }];
  });
  // Ancient sets: discriminator 0 rows are the plain set bonuses (Dragon defense...), not ancient.
  const sets = await sql`
    SELECT s."Id" AS id, g."Name" AS name, s."AncientSetDiscriminator" AS disc, s."BonusOptionId" AS bonus, ad."Designation" AS attr
    FROM config."ItemOfItemSet" s
    JOIN config."ItemSetGroup" g ON g."Id" = s."ItemSetGroupId"
    LEFT JOIN config."IncreasableItemOption" o ON o."Id" = s."BonusOptionId"
    LEFT JOIN config."PowerUpDefinition" p ON p."Id" = o."PowerUpDefinitionId"
    LEFT JOIN config."AttributeDefinition" ad ON ad."Id" = p."TargetAttributeId"
    WHERE s."ItemDefinitionId" = ${definitionId} AND s."AncientSetDiscriminator" <> 0
    ORDER BY s."AncientSetDiscriminator"
  `;
  return [...options, ...sets.map(r => ({
    id: String(r.id), kind: 'ancient' as const, number: Number(r.disc), label: String(r.name), maxLevel: r.bonus ? 2 : 0,
    bonus: r.bonus == null ? null : String(r.bonus), bonusLabel: ANCIENT_BONUS[String(r.attr)] ?? (r.attr == null ? undefined : String(r.attr)),
  }))];
}

const ANCIENT_BONUS: Record<string, string> = { 'Total Strength': 'Fuerza', 'Total Agility': 'Agilidad', 'Total Vitality': 'Vitalidad', 'Total Energy': 'Energía', 'Total Leadership': 'Comando' };

/** `sockets`: one entry per socket slot, an empty id for an empty slot. */
export type GiveRequest = { character: string; definitionId: string; level: number; skill: boolean; options: Picked[]; sockets?: Picked[]; ancient?: Picked | null; extras?: SetExtras };

/** Puts the item in the character's bag; the caller has checked the character is offline. */
export async function giveItem(sql: Sql, req: GiveRequest): Promise<{ slot: number; name: string } | { error: string }> {
  const [def] = await sql`
    SELECT "Id" AS id, "Name" AS name, "MaximumItemLevel" AS max, "Width" AS w, "Height" AS h, "SkillId" IS NOT NULL AS skill, "Durability" AS dur, "MaximumSockets" AS sockets
    FROM config."ItemDefinition" WHERE "Id" = ${req.definitionId}
  `;
  if (!def) return { error: 'No existe ese ítem.' };
  const level = Math.trunc(Number(req.level));
  if (!(level >= 0 && level <= Number(def.max))) return { error: `Este ítem va de +0 a +${def.max}.` };
  const available = await itemOptions(sql, req.definitionId);
  const checked = checkOptions(available, req.options ?? []);
  if ('error' in checked) return checked;
  const sockets = checkSockets(available, Array.isArray(req.sockets) ? req.sockets : [], Number(def.sockets) > 0 ? MAX_SOCKETS : 0);
  if ('error' in sockets) return sockets;
  const ancient = checkAncient(available, req.ancient);
  if ('error' in ancient) return ancient;

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
      VALUES (${itemId}, ${ch.inv}, ${def.id}, ${slot}, ${durabilityFor(Number(def.dur), level, excellent)}, ${level}, ${Boolean(req.skill) && Boolean(def.skill)}, ${sockets.slots.length}, NULL, 0)
    `;
    // Ancient: the item joins the set (the client reads its discriminator), the bonus is +5 / +10 (Level 1 / 2).
    if (ancient.ancient) {
      await tx`INSERT INTO data."ItemItemOfItemSet" ("ItemId", "ItemOfItemSetId") VALUES (${itemId}, ${ancient.ancient.id})`;
      if (ancient.ancient.bonus && ancient.level > 0) await tx`INSERT INTO data."ItemOptionLink" ("Id", "ItemOptionId", "ItemId", "Level", "Index") VALUES (${crypto.randomUUID()}, ${ancient.ancient.bonus}, ${itemId}, ${ancient.level}, 0)`;
    }
    // A filled socket is its option with the slot as Index. The deployed OpenMU sends Level * 50 + option,
    // so Level is the sphere level from 0 (level 5 stored as 5 wraps the byte into another option).
    for (const [i, s] of sockets.slots.entries()) {
      if (s) await tx`INSERT INTO data."ItemOptionLink" ("Id", "ItemOptionId", "ItemId", "Level", "Index") VALUES (${crypto.randomUUID()}, ${s.option.id}, ${itemId}, ${s.level - 1}, ${i})`;
    }
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
export type CharacterStats = { name: string; class: string; classNumber: number; classes: { number: number; name: string }[]; level: number; resets: number; strength: number; agility: number; vitality: number; energy: number; leadership: number | null; points: number; masterPoints: number; zen: number };

const STAT_DESIGNATIONS = { level: 'Level', resets: 'Resets', strength: 'Base Strength', agility: 'Base Agility', vitality: 'Base Vitality', energy: 'Base Energy', leadership: 'Base Leadership' } as const;
export const LIMITS = { level: [1, 400], resets: [0, 100000], stat: [1, 32500], points: [0, 2_000_000_000], masterPoints: [0, 100_000], zen: [0, 2_000_000_000] } as const;

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
    masterPoints: read('masterPoints', LIMITS.masterPoints, 'Los puntos de maestría'),
    zen: read('zen', LIMITS.zen, 'El zen'),
  };
  const bad = Object.values(out).find(v => typeof v === 'string');
  return bad ? { error: bad as string } : (out as Omit<CharacterStats, 'name' | 'class' | 'classNumber' | 'classes'>);
}

async function statRows(sql: Sql, name: string) {
  const [ch] = await sql`
    SELECT c."Id" AS id, c."Name" AS name, cc."Name" AS class, cc."Number" AS cnum, c."LevelUpPoints" AS points, c."MasterLevelUpPoints" AS mpoints, c."InventoryId" AS inv, COALESCE(s."Money", 0) AS zen
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
    points: Number(ch.points), masterPoints: Number(ch.mpoints), zen: Number(ch.zen),
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
    await tx`UPDATE data."Character" SET "LevelUpPoints" = ${checked.points}, "MasterLevelUpPoints" = ${checked.masterPoints}, "CharacterClassId" = ${newClass.id} WHERE "Id" = ${ch.id}`;
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
