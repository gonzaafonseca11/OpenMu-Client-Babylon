import { describe, expect, it } from 'vitest';
import { ENGLISH_JEWEL_NAMES } from './jewelNames';

describe('ENGLISH_JEWEL_NAMES', () => {
  it('names the ten jewels as the items are named, in the window order', () => {
    expect(ENGLISH_JEWEL_NAMES).toEqual([
      'Jewel of Bless', 'Jewel of Soul', 'Jewel of Life', 'Jewel of Creation', 'Jewel of Guardian',
      'Gemstone', 'Jewel of Harmony', 'Jewel of Chaos', 'Lower refine stone', 'Higher refine stone',
    ]);
  });
});
