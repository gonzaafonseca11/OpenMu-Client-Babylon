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

    expect(KEYS.length).toBe(2655);
    expect(hashes).toEqual({
      en: '31506d27aac5ee5c',
      bg: 'e657fca379fdea54',
      zh: 'f9dffb213adedef6',
      fr: '09a64d8a47683c63',
      de: 'c72a05f314a498de',
      it: '35f6e40315ef9a35',
      ja: '933382b473c1da5d',
      ko: 'af76c05890c379cf',
      pl: '58d3cf0a79d2c715',
      pt: 'a7a5dee5805f0603',
      ro: '4cbb8c832056659e',
      ru: '0804a3326353f0c8',
      es: 'a41a10e313ef4aa2',
      th: '380221014b9290cf',
      vi: 'fc26303299200f3c',
      ar: 'b72c673d1d8e612c',
      bn: '5326f966f5f2f238',
      ca: 'c191a4e04f014d0e',
      cs: '15151040f47caa4c',
      el: '00b49238a84dc6f3',
      eu: '064c51552be92bc7',
      fa: '2df5438162bf688d',
      fil: '5676506c46c49292',
      hi: '1f2dd2c8d2e01a4f',
      hu: '036e317505e0a8d4',
      id: '2af4910a0cd900ae',
      'sr-Latn': 'f6eb65252b32535b',
      tr: '183f70d358958a17',
      uk: 'd8dd30d0e7a7f4d3',
      ur: '996e875982e07e92',
      'zh-Hant': '0ef742a617e8f61a',
    });
  });
});
