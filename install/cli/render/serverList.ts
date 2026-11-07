// The serverlist.md served next to the client: this server as the only world (format: serverlist.md at the repo root).
import type { Config } from '../config';
import { PORTS } from '../stack';

export function serverList(c: Config): string {
  const target = c.mode === 'domain' ? c.domain : `127.0.0.1:${PORTS.connect}@ws://${c.publicIp}:${PORTS.proxy}`;
  return `# Server list\n\n[S6EP3:${c.serverName}:${c.serverDescription}:${c.serverLanguage}](${target})\n${channelLines(c.channelNames)}`;
}

/** `MU_CHANNEL_NAMES` as the world's one unnamed group and its channels, in server order. */
function channelLines(names: string): string {
  const list = names.split(',').map(n => n.trim()).filter(Boolean);
  return list.length ? `- 0:\n${list.map((n, i) => `  - ${i}: ${n}\n`).join('')}` : '';
}
