import { describe, expect, test } from 'bun:test';
import { vipReminderMail } from './vip';

describe('vipReminderMail', () => {
  test('names the account, the end date in Argentina and links to Mi cuenta', () => {
    const mail = vipReminderMail('https://mu.test', 'Mu Bardo', 'fonse<11>', new Date('2026-12-12T02:00:00Z'));
    expect(mail.subject).toBe('Mu Bardo: tu VIP termina el 11/12/2026');
    expect(mail.text).toContain('https://mu.test/#cuenta');
    expect(mail.html).toContain('fonse&#60;11&#62;');
  });
});
