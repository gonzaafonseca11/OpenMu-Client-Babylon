/**
 * Quest dialogue pages a shipped language pack gets wrong, by page number.
 *
 * `Data/Local/<pack>/Dialog_<lang>.bmd` is Webzen's own table, and a page here
 * replaces the text of one record of it after decoding, the way `itemNames.ts`
 * replaces single item names. The page keeps its answers and their links.
 * Read by `controllers/assets/mu/questFiles.ts`.
 */

export type DialogPageFixes = Readonly<Record<number, string>>;

// Page 67 opens "Three Treasures of Mu" for the Dark Wizard. Both packs copied
// the Fairy Elf's page 64 onto it, which sends a Wizard for the Tear of Elf;
// the English page stops at the three treasures and page 82 names the Soul of
// Wizard.

export const SPANISH_DIALOG_PAGES: DialogPageFixes = {
  67: "Has leído el 'Rollo del Emperador', ¿verdad? Entonces debes estar al tanto de los 3 tesoros registrados en él.",
  // The 3rd class quest's three proofs: this server sells them at Thompson the Merchant in south Aida.
  153: 'Destruye a los monstruos Rayo de la Muerte, Hell Maine y Fénix Oscuro que dominan Tarkan, Aida e Ícaro y trae las 3 evidencias correspondientes. También puedes comprarlas a Thompson el Mercader, en el sur de Aida.',
};

export const PORTUGUESE_DIALOG_PAGES: DialogPageFixes = {
  67: "Você leu o 'Pergaminho do Imperador', não leu? Então você sabe sobre os 3 tesouros registrados nele.",
  153: 'Destrua os monstros Raio da Morte, Hellmaine e Fênix negra que dominam Tarkan, Aida e Icarus e traga 3 provas de que o fez. Você também pode comprá-las de Thompson, o Mercador, no sul de Aida.',
};

/** A pack's name for a quest item in its prose -> the English item name. */
export type DialogItemNames = Readonly<Record<string, string>>;

/** The legacy quest items the Spanish prose names, as `Dialog_eng.bmd` names them. */
export const SPANISH_DIALOG_ITEM_NAMES: DialogItemNames = {
  'Rollo del Emperador': 'Scroll of the Emperor',
  'Decreto del Emperador': 'Decree of the Emperor',
  'Espada Quebrada': 'Broken Sword',
  'Lágrima de Elfa': 'Tear of Elf',
  'Alma de Mago': 'Soul of Wizard',
  'Anillo de Gloria': 'Ring of Glory',
  'Piedra Oscura': 'Dark Stone',
};

/** The page with its item names in English, for a world or player that shows items in English. */
export function withEnglishItemNames(text: string, names: DialogItemNames): string {
  let out = text;
  for (const [pack, english] of Object.entries(names)) out = out.split(pack).join(english);
  return out;
}
