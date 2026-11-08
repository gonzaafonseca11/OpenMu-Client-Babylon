import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { normalEmail, openMuHash, passwordProblem, recoveryMail } from './recovery';

describe('account recovery', () => {
  it('takes the game password rule only', () => {
    expect(passwordProblem('abc123')).toBeNull();
    expect(passwordProblem('p@ss-w0rd')).toBeNull();
    expect(passwordProblem('abc')).toMatch(/4 a 10/);
    expect(passwordProblem('abcdefghijk')).toMatch(/4 a 10/);
    expect(passwordProblem('contraseña')).toMatch(/acentos/);
    expect(passwordProblem(5)).toMatch(/4 a 10/);
  });

  it('hashes like OpenMU: $2a$ at cost 11, and it verifies', async () => {
    const hash = await openMuHash('abc123');
    expect(hash.startsWith('$2a$11$')).toBe(true);
    expect(await bcrypt.compare('abc123', hash)).toBe(true);
  });

  it('lists every account of the address with its own link, as text', () => {
    const mail = recoveryMail('https://mu.example', 'MU', [
      { login: 'uno', link: 'https://mu.example/#restablecer=a' },
      { login: 'dos<b>', link: 'https://mu.example/#restablecer=b' },
    ]);
    expect(mail.text).toContain('Cuenta: uno');
    expect(mail.text).toContain('#restablecer=b');
    expect(mail.html).toContain('dos&#60;b&#62;');
    expect(normalEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });
});
