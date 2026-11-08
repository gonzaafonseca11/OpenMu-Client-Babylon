// The website's database role: it may log in and read what the site shows, nothing else (site/readme.md).
import type { Config } from './config';
import type { Stack } from './docker';
import { SITE_DB_ROLE } from './stack';

/** Account columns the site needs: its login check, the GM/ban filter and the chat ban. Never e-mail, vault or security code. */
const ACCOUNT_COLUMNS = ['Id', 'LoginName', 'PasswordHash', 'State', 'IsBot', 'IsTemplate', 'ChatBanUntil'];
const TABLES = ['data."Character"', 'data."StatAttribute"', 'config."AttributeDefinition"', 'config."CharacterClass"', 'config."GameMapDefinition"',
  // The GM panel's item maker reads the item definitions and the bag it fills.
  'config."ItemDefinition"', 'config."ItemDefinitionItemOptionDefinition"', 'config."IncreasableItemOption"', 'config."ItemOptionType"',
  'config."ItemOptionOfLevel"', 'config."PowerUpDefinition"', 'data."Item"', 'data."ItemOptionLink"'];
/** The only rows the site may add: a GM's item and its options (site/server/gm.ts). Never update or delete. */
const INSERT_TABLES = ['data."Item"', 'data."ItemOptionLink"'];

/** Idempotent: creates the role when missing, sets its password and its grants every time. */
export function siteRoleSql(c: Config): string {
  // newSecret() is base64url, so it never holds a quote; refuse anything else rather than escape it.
  if (!/^[A-Za-z0-9_-]+$/.test(c.siteDbSecret)) throw new Error('The website database secret is missing or malformed.');
  const role = SITE_DB_ROLE;
  return [
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} LOGIN; END IF; END $$;`,
    `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${c.siteDbSecret}';`,
    `ALTER ROLE ${role} SET default_transaction_read_only = on;`,
    `GRANT CONNECT ON DATABASE openmu TO ${role};`,
    `GRANT USAGE ON SCHEMA data, config TO ${role};`,
    `GRANT SELECT (${ACCOUNT_COLUMNS.map(col => `"${col}"`).join(', ')}) ON data."Account" TO ${role};`,
    `GRANT SELECT ON ${TABLES.join(', ')} TO ${role};`,
    `GRANT INSERT ON ${INSERT_TABLES.join(', ')} TO ${role};`,
    // FOR UPDATE on the character row while its bag is filled.
    `GRANT UPDATE ("InventoryId") ON data."Character" TO ${role};`,
    '',
  ].join('\n');
}

/** Run after the database is up; the site retries its connection, so it needs no restart. */
export async function ensureSiteRole(stack: Stack): Promise<void> {
  const r = await stack.exec('database', ['psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'openmu'], siteRoleSql(stack.config));
  if (r.code !== 0) throw new Error(`Could not set up the website's database role: ${r.err}`);
}
