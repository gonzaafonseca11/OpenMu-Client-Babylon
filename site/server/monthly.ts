import type { Database } from 'bun:sqlite';
import type { RankedCharacter, ResetsNow } from './queries';
import { RANKING_SIZE } from './queries';

/**
 * The monthly rankings with prizes. Months are Argentina's (UTC-3, no summer time). The month's
 * resets are each character's resets now minus a snapshot taken when the month began; when a month
 * ends its top 3 of each ranking are kept for the GM to hand out the prizes.
 */

const ART_OFFSET_MS = 3 * 3_600_000;
/** New characters start with this many gifted resets (OpenMU StarterGiftPlugIn); the month does not count them. Set 0 when the gift ends. */
export const GIFT_RESETS = 10;
export const WINNERS = 3;
export type MonthlyKind = 'pk' | 'resets';
export type Winner = { month: string; kind: MonthlyKind; place: number; name: string; class: string; score: number; delivered: boolean };

/** `YYYY-MM` of the month `at` falls in, Argentina time. */
export const monthKey = (at: number) => new Date(at - ART_OFFSET_MS).toISOString().slice(0, 7);

/** When a month began, as an instant. */
export const monthStart = (key: string) => new Date(Date.parse(`${key}-01T00:00:00Z`) + ART_OFFSET_MS);

/** Resets gained since the snapshot (a character made later started with the gift), best first. */
export function monthlyResets(now: readonly ResetsNow[], snapshot: ReadonlyMap<string, number>): RankedCharacter[] {
  return now
    .map(c => ({ name: c.name, class: c.class, level: c.level, kills: 0, resets: c.resets - (snapshot.get(c.id) ?? Math.min(c.resets, GIFT_RESETS)) }))
    .filter(c => c.resets > 0)
    .sort((a, b) => b.resets - a.resets || b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, RANKING_SIZE);
}

type Source = { resetsNow: () => Promise<ResetsNow[]>; pk: (since: Date, until: Date) => Promise<RankedCharacter[]> };

export function openMonthly(db: Database, source: Source) {
  const latest = db.query<{ month: string }, []>('SELECT month FROM months ORDER BY month DESC LIMIT 1');
  const addMonth = db.query<unknown, [string, number]>('INSERT OR IGNORE INTO months (month, at) VALUES (?, ?)');
  const addSnap = db.query<unknown, [string, string, number]>('INSERT OR REPLACE INTO reset_snapshot (month, character_id, resets) VALUES (?, ?, ?)');
  const snapOf = db.query<{ character_id: string; resets: number }, [string]>('SELECT character_id, resets FROM reset_snapshot WHERE month = ?');
  const addWinner = db.query<unknown, [string, string, number, string, string, number]>(
    'INSERT OR IGNORE INTO monthly_winners (month, kind, place, name, class, score) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const winners = db.query<{ month: string; kind: MonthlyKind; place: number; name: string; class: string; score: number; delivered: number }, []>(
    'SELECT * FROM monthly_winners ORDER BY month DESC, kind DESC, place LIMIT 120'
  );
  const deliver = db.query<unknown, [number, string, string, number]>('UPDATE monthly_winners SET delivered = ? WHERE month = ? AND kind = ? AND place = ?');

  const snapshot = (month: string) => new Map(snapOf.all(month).map(r => [r.character_id, r.resets]));

  return {
    /** Once a minute: on a new month, keep last month's top 3, then snapshot everyone's resets. */
    async tick(now = Date.now()): Promise<void> {
      const month = monthKey(now);
      const last = latest.get()?.month;
      if (last === month) return;
      const everyone = await source.resetsNow();
      if (last) {
        const resets = monthlyResets(everyone, snapshot(last)).slice(0, WINNERS);
        const pk = (await source.pk(monthStart(last), monthStart(month))).slice(0, WINNERS);
        db.transaction(() => {
          resets.forEach((c, i) => addWinner.run(last, 'resets', i + 1, c.name, c.class, c.resets));
          pk.forEach((c, i) => addWinner.run(last, 'pk', i + 1, c.name, c.class, c.kills));
        })();
      }
      db.transaction(() => {
        for (const c of everyone) addSnap.run(month, c.id, c.resets);
        addMonth.run(month, now);
      })();
    },
    async resets(now = Date.now()): Promise<RankedCharacter[]> {
      return monthlyResets(await source.resetsNow(), snapshot(monthKey(now)));
    },
    pk: (now = Date.now()) => source.pk(monthStart(monthKey(now)), new Date('9999-01-01')),
    winners: (): Winner[] => winners.all().map(w => ({ ...w, delivered: w.delivered === 1 })),
    deliver: (month: string, kind: string, place: number, done: boolean) => deliver.run(done ? 1 : 0, month, kind, place),
  };
}
