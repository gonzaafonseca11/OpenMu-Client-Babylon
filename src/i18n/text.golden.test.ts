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
      en: 'c509482a051d3a34',
      bg: '378a8bc7f26141ea',
      zh: 'f2c03896b2450bd0',
      fr: '577867fb4e003d15',
      de: '33566f58b42705f8',
      it: '8e3eb2275749baac',
      ja: '0c47082b4fb5c0e5',
      ko: 'aae9556dac523977',
      pl: '085764436f2d89e4',
      pt: 'ee81c6c7e2437274',
      ro: 'e401820730c7ae81',
      ru: '2cf96fbc609fefea',
      es: '6aed966712b86064',
      th: 'cc844881771cd6c3',
      vi: '5a2c919ef5a5b9b6',
      ar: 'a7c2d838bece5549',
      bn: 'af95849e3f18c2f8',
      ca: 'fb3e68a679874bf9',
      cs: 'e197dd946294984d',
      el: '7c658e31bc09d77c',
      eu: '85a08017fe87c6ea',
      fa: '62fb3579665d95ec',
      fil: '3dd5bec079e7fb26',
      hi: '9327d4de9097731d',
      hu: '7e85efc3f1799b89',
      id: 'afe4498be8c2f4e4',
      'sr-Latn': '47881d1d3a9432e2',
      tr: '3ce5d11bb624da34',
      uk: '3cbd26722b8ef64e',
      ur: 'd69f23f8f8c4d238',
      'zh-Hant': 'f9efcab201a3f132',
    });
  });
});
