import { afterEach, describe, expect, it } from 'vitest';
import { serverMinAttackInterval, setServerAttackSpeedMax } from './playSpeed';

describe('serverMinAttackInterval', () => {
  afterEach(() => setServerAttackSpeedMax(undefined));

  it('caps the speed at 200 until the server says otherwise', () => {
    expect(serverMinAttackInterval(1625)).toBeCloseTo(0.231);
  });

  it('follows a raised cap, down to the 60 ms floor', () => {
    setServerAttackSpeedMax(325);
    expect(serverMinAttackInterval(1625)).toBeCloseTo(0.066);
    expect(serverMinAttackInterval(250)).toBeCloseTo(0.165);
  });
});
