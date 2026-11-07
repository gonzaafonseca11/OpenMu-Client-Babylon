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

    expect(KEYS.length).toBe(2643);
    expect(hashes).toEqual({
      en: 'ac86b2c8db17e628',
      bg: '73ba1e47556f860b',
      zh: '5978b70b328c0726',
      fr: '08a15a49bf8d1a12',
      de: 'abacd1d95a7b18a0',
      it: 'd8a41739625272c1',
      ja: 'd4fdd3003fdf4957',
      ko: 'dd953e689070ef88',
      pl: '55661d27636fb06f',
      pt: 'e2826fce2886d17a',
      ro: 'f154f233ba992b15',
      ru: 'e694c24ebe31a294',
      es: 'c400d9bc06d29188',
      th: '0709134e07a7afbc',
      vi: '771ba64de93b15ce',
      ar: '118849faae55789c',
      bn: '47fc3b2b23c00548',
      ca: 'd23e36294d943b91',
      cs: '8bd9ab6fb6c52294',
      el: '974a1e7b5a3298fc',
      eu: '9d84a7c822c520d4',
      fa: 'e438ed8260f86c4e',
      fil: '1294f2c14768395e',
      hi: '8db74b568e5e398b',
      hu: '2658729e63c8398e',
      id: '49879bb2470fccf3',
      'sr-Latn': 'ee7a79c23621d988',
      tr: '50afc136c81948ed',
      uk: 'ba7884cf57680bf9',
      ur: 'ec561510dd3daae8',
      'zh-Hant': '0ab9639cd5206621',
    });
  });
});
