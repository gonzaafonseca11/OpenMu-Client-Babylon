import { describe, expect, it } from 'vitest';
import { SPANISH_DIALOG_ITEM_NAMES, withEnglishItemNames } from './dialogPages';

describe('withEnglishItemNames', () => {
  it('names the quest items in English inside the Spanish prose', () => {
    expect(
      withEnglishItemNames("El 'Rollo del Emperador' contiene una fuerza poderosa.", SPANISH_DIALOG_ITEM_NAMES)
    ).toBe("El 'Scroll of the Emperor' contiene una fuerza poderosa.");
  });

  it('replaces every one on the page', () => {
    expect(
      withEnglishItemNames("la 'Espada Quebrada', la 'Lágrima de Elfa', y el 'Alma de Mago'.", SPANISH_DIALOG_ITEM_NAMES)
    ).toBe("la 'Broken Sword', la 'Tear of Elf', y el 'Soul of Wizard'.");
  });

  it('leaves prose without an item name alone', () => {
    const text = 'quiebran sus espadas como símbolo de su juramento';
    expect(withEnglishItemNames(text, SPANISH_DIALOG_ITEM_NAMES)).toBe(text);
  });
});
