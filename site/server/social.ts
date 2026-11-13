/** The footer's social links from `SITE_SOCIAL_LINKS`: `Name=https://...` pairs, comma separated. */
export function socialLinks(text: string, escape: (s: string) => string): string {
  const links = text.split(',').map(pair => {
    const at = pair.indexOf('=');
    const name = pair.slice(0, at).trim();
    const url = pair.slice(at + 1).trim();
    return at > 0 && name && /^https:\/\//.test(url) ? `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(name)}</a>` : '';
  }).filter(Boolean);
  return links.length ? `<nav class="social">${links.join(' · ')}</nav>` : '';
}
