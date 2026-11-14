import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { EN_TEXT, i18n, t, type TextKey } from './index';

/**
 * Pins what `t(key)` returns for every key in every language, switching the
 * language through the engine, plus each language's selector metadata. Moving
 * text between files must leave every hash as it is.
 */

const KEYS = (Object.keys(EN_TEXT) as TextKey[]).sort();

function languageHash(code: string): string {
  i18n.setLanguage(code);
  expect(i18n.language).toBe(code);

  const layer = i18n.current;
  const pack = layer.dataPack;
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      layer.name, layer.code, layer.aliases ?? [], layer.label, layer.region, layer.font ?? '',
      pack ? [pack.folder, pack.suffix, pack.encoding ?? '', !!pack.repairs, !!pack.itemNames, !!pack.dialogPages] : null,
    ])
  );
  for (const key of KEYS) hash.update(`${key}\t${t(key)}\t${i18n.translated(key)}\n`);
  return hash.digest('hex').slice(0, 16);
}

describe('text golden', () => {
  it('every key reads the same line in every language', () => {
    const was = i18n.language;
    const hashes = Object.fromEntries(i18n.languages.map(l => [l.code, languageHash(l.code)]));
    i18n.setLanguage(was);

    expect(KEYS.length).toBe(2656);
    expect(hashes).toEqual({
      en: 'f65920e5c020afd7',
      bg: '05e8ca3437a1af24',
      zh: '33da4203e9ae26fb',
      fr: '9681afb0ad5d86c1',
      de: '9efb18f158b62699',
      it: 'ef894c10399111b1',
      ja: '2ea52173c6c61586',
      ko: 'b3e4d2969defb4bb',
      pl: 'bc68ca6135ffc938',
      pt: 'bd2870e526eb2682',
      ro: 'af57c80d57ef79df',
      ru: '5f6bff283adf6cce',
      es: '863bbf9aa276c0d2',
      th: 'ed8118c543d2600a',
      vi: 'c3cc9a2286f80322',
      ar: '0e86788e8d7abd39',
      bn: '59b982892d7978bb',
      ca: '90e1bfa8e71a2769',
      cs: 'd506d4777587ff81',
      el: '587e2c4c0e77332d',
      eu: '21e590ae437ea8e3',
      fa: '7097b5883610cb38',
      fil: 'ad5b6d22d1fcdb7b',
      hi: '5491d19f60b304b0',
      hu: '9100892e208d04ee',
      id: '6ba0374bc3ea6344',
      'sr-Latn': '0fd120b0fc7f1761',
      tr: '98f7fb769c70440a',
      uk: 'aa9632b510198722',
      ur: 'deaa96481d31d7fb',
      'zh-Hant': 'b04b916b7e599693',
    });
  });
});
