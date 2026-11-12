import type { Sql } from 'postgres';

/**
 * VIP accounts (mu_plugins.vip, made by install/cli/siteRole.ts and OpenMU's Vip plugin): who may play
 * on the VIP game server and until when. The GM panel gives or takes days by hand; the Mercado Pago
 * subscription will extend it on each payment.
 */

export type VipState = { until: string; autoRenew: boolean } | null;
export type VipRow = { login: string; until: string; autoRenew: boolean };

export const VIP_MAX_DAYS = 3650;

/** The account's VIP while it runs, else null. */
export async function vipOf(sql: Sql, accountId: string): Promise<VipState> {
  const [row] = await sql`SELECT until, auto_renew FROM mu_plugins.vip WHERE account_id = ${accountId} AND until > now()`;
  return row ? { until: (row.until as Date).toISOString(), autoRenew: Boolean(row.auto_renew) } : null;
}

/** Every running VIP, the soonest to end first. */
export async function vipList(sql: Sql): Promise<VipRow[]> {
  const rows = await sql`
    SELECT a."LoginName" AS login, v.until, v.auto_renew FROM mu_plugins.vip v
    JOIN data."Account" a ON a."Id" = v.account_id WHERE v.until > now() ORDER BY v.until`;
  return rows.map(r => ({ login: String(r.login), until: (r.until as Date).toISOString(), autoRenew: Boolean(r.auto_renew) }));
}

/** Days on top of what is left (or from now); 0 ends it now. The account by its login, case-insensitive. */
export async function vipGrant(sql: Sql, login: string, days: number): Promise<{ login: string; until: string | null } | { error: string }> {
  if (!Number.isInteger(days) || days < 0 || days > VIP_MAX_DAYS) return { error: `Los días van de 0 a ${VIP_MAX_DAYS}.` };
  return sql.begin('read write', async tx => {
    const [acc] = await tx`SELECT "Id" AS id, "LoginName" AS login FROM data."Account" WHERE lower("LoginName") = lower(${login}) AND NOT "IsBot" AND NOT "IsTemplate"`;
    if (!acc) return { error: `La cuenta "${login}" no existe.` };
    if (days === 0) {
      await tx`UPDATE mu_plugins.vip SET until = now(), auto_renew = false, updated_at = now() WHERE account_id = ${acc.id}`;
      return { login: String(acc.login), until: null };
    }
    const [row] = await tx`
      INSERT INTO mu_plugins.vip (account_id, until) VALUES (${acc.id}, now() + make_interval(days => ${days}))
      ON CONFLICT (account_id) DO UPDATE SET until = greatest(mu_plugins.vip.until, now()) + make_interval(days => ${days}), updated_at = now()
      RETURNING until`;
    return { login: String(acc.login), until: (row.until as Date).toISOString() };
  });
}

/** The account's Mercado Pago subscription id and VIP end, running or not. */
export async function vipRecord(sql: Sql, accountId: string): Promise<{ subscriptionId: string | null; until: Date | null; autoRenew: boolean }> {
  const [row] = await sql`SELECT subscription_id, until, auto_renew FROM mu_plugins.vip WHERE account_id = ${accountId}`;
  return row
    ? { subscriptionId: (row.subscription_id as string | null) ?? null, until: row.until as Date, autoRenew: Boolean(row.auto_renew) }
    : { subscriptionId: null, until: null, autoRenew: false };
}

/** Records the account's subscription and whether it renews; a new account row starts expired (now) until a charge comes in. */
export async function vipSetSubscription(sql: Sql, accountId: string, subscriptionId: string, autoRenew: boolean): Promise<void> {
  await sql.begin('read write', async tx => {
    await tx`
      INSERT INTO mu_plugins.vip (account_id, until, auto_renew, subscription_id) VALUES (${accountId}, now(), ${autoRenew}, ${subscriptionId})
      ON CONFLICT (account_id) DO UPDATE SET auto_renew = ${autoRenew}, subscription_id = ${subscriptionId}, updated_at = now()`;
  });
}

/** One paid month on top of what is left; a payment already counted adds nothing. Returns the new end, or null when it was a repeat. */
export async function vipAddPaidMonth(sql: Sql, accountId: string, paymentId: string): Promise<Date | null> {
  return sql.begin('read write', async tx => {
    const [fresh] = await tx`INSERT INTO mu_plugins.vip_payment (id, account_id) VALUES (${paymentId}, ${accountId}) ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (!fresh) return null;
    const [row] = await tx`
      INSERT INTO mu_plugins.vip (account_id, until) VALUES (${accountId}, now() + interval '1 month')
      ON CONFLICT (account_id) DO UPDATE SET until = greatest(mu_plugins.vip.until, now()) + interval '1 month', updated_at = now()
      RETURNING until`;
    return row.until as Date;
  });
}
