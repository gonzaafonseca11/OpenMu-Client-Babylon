import { describe, expect, test } from 'bun:test';
import { socialLinks } from './social';

const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

describe('socialLinks', () => {
  test('one link per pair, in order; known networks get their logo', () => {
    const html = socialLinks('Discord=https://discord.gg/x, Foro=https://example.com/f?a=1', esc);
    expect(html).toStartWith('<nav class="social"><a class="discord" href="https://discord.gg/x" target="_blank" rel="noopener"><svg');
    expect(html).toEndWith('</svg>Discord</a><a class="foro" href="https://example.com/f?a=1" target="_blank" rel="noopener">Foro</a></nav>');
  });

  test('nothing when empty, and skips broken or non-https pairs', () => {
    expect(socialLinks('', esc)).toBe('');
    expect(socialLinks('Discord, X=javascript:alert(1)', esc)).toBe('');
  });
});
