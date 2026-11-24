/**
 * Ours, server-driven: level-up points travel in 16 bits, so past 65535 they arrive wrapped (66000 as 464).
 * The openmu plugin `WidePointsPlugIn` sends the real number on each entry to the world, 4 bytes on this
 * module's packet; level-ups then wrap next to it. A server without the plugin leaves the original 16 bits.
 */
import { runInAction } from 'mobx';
import { Hero } from './state';

const TURN = 65536;

/** This module's packet from its server half (`api.onPacket`): the points as a little-endian uint32. */
export function onHeroPacket(payload: Uint8Array): void {
  if (payload.length !== 4) return;
  const points = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, true);
  runInAction(() => (Hero.points = points));
}

/** A wrapped point count: the value with those low 16 bits nearest to the last one. */
export function unwrapPoints(wrapped: number, last: number): number {
  if (wrapped >= TURN || last < TURN) return wrapped;
  const base = last - (last % TURN) + wrapped;
  return [base - TURN, base, base + TURN].reduce((a, b) => (Math.abs(b - last) < Math.abs(a - last) ? b : a));
}
