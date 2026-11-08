import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './config';
import { caddyfile, publicPorts } from './render/caddy';
import { serviceEnv } from './render/env';
import { siteRoleSql } from './siteRole';

const domain = { ...DEFAULTS, domain: 'example.com', siteDbSecret: 'abc_DEF-123', siteSessionSecret: 'sess' };

describe('website', () => {
  it('gives its role reads, GM writes and recovery only, and only eight account columns', () => {
    const sqlText = siteRoleSql(domain);
    expect(sqlText).toContain("PASSWORD 'abc_DEF-123'");
    expect(sqlText).toContain('default_transaction_read_only = on');
    expect(sqlText).toContain('GRANT SELECT ("Id", "LoginName", "PasswordHash", "State", "IsBot", "IsTemplate", "ChatBanUntil", "EMail") ON data."Account"');
    expect(sqlText).toContain('GRANT UPDATE ("PasswordHash", "EMail") ON data."Account" TO mu_site;');
    expect(sqlText).not.toMatch(/"(VaultPassword|SecurityCode)"/);
    expect(sqlText).not.toMatch(/GRANT (DELETE|ALL)/);
    expect(sqlText).toContain('GRANT INSERT ON data."Item", data."ItemOptionLink", data."SkillEntry" TO mu_site;');
    expect(sqlText).toContain('GRANT UPDATE ("Value") ON data."StatAttribute" TO mu_site;');
    expect(sqlText.match(/GRANT (INSERT|UPDATE)[^;]*;/g)).toHaveLength(4);
  });

  it('refuses a secret that could break out of the quotes', () => {
    expect(() => siteRoleSql({ ...domain, siteDbSecret: "x'; DROP ROLE postgres; --" })).toThrow();
    expect(() => siteRoleSql({ ...domain, siteDbSecret: '' })).toThrow();
  });

  it('is served on the bare domain, www sends there, play stays the client', () => {
    const file = caddyfile(domain);
    expect(file).toContain('example.com {\n\treverse_proxy site:3400\n}');
    expect(file).toContain('www.example.com {\n\tredir https://example.com{uri}\n}');
    expect(file).toContain('play.example.com {');
    expect(publicPorts({ ...domain, mode: 'ip', publicIp: '203.0.113.7' })).toContain(8082);
  });

  it('connects as its own role with secure cookies over HTTPS', () => {
    const env = serviceEnv(domain).site;
    expect(env?.DATABASE_URL).toBe('postgres://mu_site:abc_DEF-123@database:5432/openmu');
    expect(env?.SITE_SECURE_COOKIE).toBe('on');
    expect(env?.SITE_URL).toBe('https://example.com');
    expect(serviceEnv({ ...domain, siteMailKey: 're_x', siteMailFrom: 'MU <a@example.com>' }).site?.MAIL_API_KEY).toBe('re_x');
    expect(env?.SITE_PLAY_URL).toBe('https://play.example.com');
    expect(env?.SITE_REGISTER_URL).toBe('https://register.example.com');
    expect(serviceEnv({ ...domain, mode: 'ip', publicIp: '203.0.113.7' }).site?.SITE_SECURE_COOKIE).toBe('off');
    expect(serviceEnv({ ...domain, signupsPerDay: 4 }).register?.RATE_LIMIT).toBe('4');
  });
});
