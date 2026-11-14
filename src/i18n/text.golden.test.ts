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

    expect(KEYS.length).toBe(2654);
    expect(hashes).toEqual({
      en: '872c134cb5e0505d',
      bg: 'a91173972291bab4',
      zh: '5af8624cfd2849c8',
      fr: '781dff91e61259c9',
      de: '5ccf0f122aea9c2f',
      it: '665e39628e310341',
      ja: 'f2ba8523b40d8a03',
      ko: '783202c8444f4488',
      pl: 'bc601bddac419db6',
      pt: 'dbdff4e1de9985d1',
      ro: '40cba41b84d48a5a',
      ru: 'e4eb50ce61048c5e',
      es: 'ddfaa50bcf0032f6',
      th: 'a4304b76c22dfef5',
      vi: '6be0e84caf98eccf',
      ar: '14f5a25c5efd52d6',
      bn: 'c34f8592af129cf0',
      ca: '23ba9e4776304644',
      cs: '674a803d5fb06489',
      el: 'f4251dd6645d5074',
      eu: 'dcd2f403d475b47c',
      fa: '78e33f46894935c7',
      fil: 'dc622504297058ae',
      hi: 'af90ac3345a66df8',
      hu: '1c16543d4831e5d3',
      id: '4a1af501ce374dc5',
      'sr-Latn': '16f7fc4adca6c895',
      tr: '3e14e0320079a7a9',
      uk: '8d4bc7ae58dd3de9',
      ur: '598c3de385eb786b',
      'zh-Hant': 'c44ab243d09bcd70',
    });
  });
});
