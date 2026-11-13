import { describe, expect, test } from 'bun:test';
import { socialLinks } from './social';

const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

describe('socialLinks', () => {
  test('one link per pair, in order', () => {
    const html = socialLinks('Discord=https://discord.gg/x, Instagram=https://instagram.com/y?a=1', esc);
    expect(html).toBe('<nav class="social"><a href="https://discord.gg/x" target="_blank" rel="noopener">Discord</a> · <a href="https://instagram.com/y?a=1" target="_blank" rel="noopener">Instagram</a></nav>');
  });

  test('nothing when empty, and skips broken or non-https pairs', () => {
    expect(socialLinks('', esc)).toBe('');
    expect(socialLinks('Discord, X=javascript:alert(1)', esc)).toBe('');
  });
});
