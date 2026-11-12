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

    expect(KEYS.length).toBe(2651);
    expect(hashes).toEqual({
      en: '2823649c62d01988',
      bg: '49e439075d981f87',
      zh: '90a22694a0bb3a45',
      fr: 'a028a1e567146cee',
      de: '7356fde3746f34b6',
      it: 'a5b84c3846c7ff22',
      ja: '260fb3c212f7c99f',
      ko: 'abb7b2ba7a83d1f3',
      pl: 'b85fcde6d02e5abe',
      pt: 'ee12a372c9b26ca2',
      ro: 'bf5e152bd6cdafaa',
      ru: 'dd43eedd9d57d9be',
      es: '865457b221a0233e',
      th: 'c770f3fb7cac5a69',
      vi: '7cfaf5d4cf6f36e7',
      ar: '9ee5c2d16a006600',
      bn: '1db3fa0f57c30c22',
      ca: 'a348c3036f0257a8',
      cs: '4cd4414d49dda4b5',
      el: 'aa62c74d6381ba1c',
      eu: '6e7667121f10344b',
      fa: 'afa90b1ddaa86344',
      fil: 'c275d56fa7c40164',
      hi: '64df7f676a65289f',
      hu: '39b3c575a2983150',
      id: '0ed643234c2b6fef',
      'sr-Latn': 'b8bcb5d8577709dd',
      tr: 'a83c807a49e39cb9',
      uk: '5064ab0ce124682b',
      ur: 'c247479f96de80f5',
      'zh-Hant': 'ae224c267f1cf139',
    });
  });
});
