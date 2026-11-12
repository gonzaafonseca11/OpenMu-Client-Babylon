import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { paymentApproved, signatureValid } from './mp';

describe('Mercado Pago', () => {
  it('accepts only notifications signed with the webhook secret', () => {
    const v1 = createHmac('sha256', 's3cret').update('id:123;request-id:req-1;ts:1700;').digest('hex');
    expect(signatureValid('s3cret', `ts=1700,v1=${v1}`, 'req-1', '123')).toBe(true);
    expect(signatureValid('other', `ts=1700,v1=${v1}`, 'req-1', '123')).toBe(false);
    expect(signatureValid('s3cret', `ts=1700,v1=${v1}`, 'req-1', '124')).toBe(false);
    expect(signatureValid('s3cret', null, 'req-1', '123')).toBe(false);
    expect(signatureValid('', `ts=1700,v1=${v1}`, 'req-1', '123')).toBe(false);
  });

  it('counts a charge only when it went through', () => {
    expect(paymentApproved({ id: 1, preapproval_id: 'p', status: 'processed', payment: { status: 'approved' } })).toBe(true);
    expect(paymentApproved({ id: 1, preapproval_id: 'p', status: 'processed', payment: { status: 'rejected' } })).toBe(false);
    expect(paymentApproved({ id: 1, preapproval_id: 'p', status: 'scheduled' })).toBe(false);
  });
});
