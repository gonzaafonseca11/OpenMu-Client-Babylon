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

    expect(KEYS.length).toBe(2652);
    expect(hashes).toEqual({
      en: '5851fdead270995f',
      bg: '4395bb2f0ddcaf09',
      zh: '1753ec9bcdcf7585',
      fr: '4870333aaa49f9d4',
      de: '5a153703ac2beb9a',
      it: '84c504c774ebff23',
      ja: '055968ff2ff7c94f',
      ko: '0c68760586f844a3',
      pl: 'fb9e532d24558459',
      pt: '85855185db45e6f8',
      ro: '227da3550d100743',
      ru: 'caba18f19a217e80',
      es: '375268b7cc48aab6',
      th: '57710394474ce27e',
      vi: '12731d0660fce94f',
      ar: '28caa4f70ca03357',
      bn: '0bc9898a42786a12',
      ca: 'de9ff5b5f0d2badf',
      cs: '5228337d963d81c4',
      el: '47af2ba7623dec08',
      eu: 'd01324eedc5b6ed5',
      fa: '9c2bc1ed268452d5',
      fil: 'bda0468ecbd4cf0b',
      hi: '96932569e2b9915b',
      hu: '14f1dcab29b74089',
      id: '6998c3c49b76652b',
      'sr-Latn': 'fcf36e4b496e60a5',
      tr: '74085f04f2e7a4a6',
      uk: 'bbbd9e96a38d69f3',
      ur: '7680eda2f7f66641',
      'zh-Hant': 'f4938a0a49defc5e',
    });
  });
});
