import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Mercado Pago subscriptions (preapproval) for the VIP: the site makes one per account, Mercado Pago
 * charges it every month and notifies /api/mp/webhook; each approved charge adds a month of VIP
 * (site/server/vip.ts). Docs: mercadopago.com.ar/developers, "Suscripciones sin plan asociado".
 */

const API = 'https://api.mercadopago.com';

export type MpConfig = { token: string; webhookSecret: string; price: number; siteUrl: string };
export type Preapproval = { id: string; status: string; external_reference?: string; next_payment_date?: string };
export type AuthorizedPayment = { id: number | string; preapproval_id: string; status: string; payment?: { status?: string } };

async function mp<T>(cfg: MpConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mercado Pago ${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** A new monthly subscription; the player authorizes it at `init_point`. `start` delays the first charge (re-subscribing while VIP runs). */
export function createSubscription(cfg: MpConfig, accountId: string, email: string, start?: Date) {
  return mp<Preapproval & { init_point: string }>(cfg, 'POST', '/preapproval', {
    reason: 'VIP Mu Bardo (mensual)',
    external_reference: accountId,
    payer_email: email,
    back_url: `${cfg.siteUrl}/#cuenta`,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: cfg.price,
      currency_id: 'ARS',
      ...(start && start.getTime() > Date.now() + 60_000 ? { start_date: start.toISOString() } : {}),
    },
  });
}

export const getSubscription = (cfg: MpConfig, id: string) => mp<Preapproval>(cfg, 'GET', `/preapproval/${encodeURIComponent(id)}`);
export const cancelSubscription = (cfg: MpConfig, id: string) => mp<Preapproval>(cfg, 'PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' });
export const getAuthorizedPayment = (cfg: MpConfig, id: string) => mp<AuthorizedPayment>(cfg, 'GET', `/authorized_payments/${encodeURIComponent(id)}`);

/** Whether an authorized payment was really charged. */
export const paymentApproved = (p: AuthorizedPayment) => p.status === 'processed' && (p.payment?.status ?? 'approved') === 'approved';

/**
 * Mercado Pago's webhook signature: `x-signature: ts=...,v1=...` is the HMAC-SHA256, with the webhook
 * secret, of `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (a part with no value is left out).
 */
export function signatureValid(secret: string, header: string | null, requestId: string | null, dataId: string): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=', 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
