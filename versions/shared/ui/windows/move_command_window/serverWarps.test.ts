import { describe, expect, it } from 'vitest';
import type { MoveReqEntry } from '@/controllers/assets/mu';
import { withServerWarps } from './serverWarps';

const row = (index: number, name: string): MoveReqEntry => ({ index, name, alias: name, reqLevel: 10, reqMaxLevel: 0, zen: 2000, gate: 1 });

describe('withServerWarps', () => {
  it('adds the rows the world publishes after the file', () => {
    const list = withServerWarps([row(2, 'Lorencia')], [{ index: 24, name: 'Crywolf', level: 200, zen: 15000 }]);
    expect(list.map(e => [e.index, e.name, e.reqLevel, e.zen])).toEqual([[2, 'Lorencia', 10, 2000], [24, 'Crywolf', 200, 15000]]);
  });

  it('never repeats a warp the file already has', () => {
    expect(withServerWarps([row(24, 'Crywolf')], [{ index: 24, name: 'Other', level: 1, zen: 1 }])).toHaveLength(1);
  });
});
