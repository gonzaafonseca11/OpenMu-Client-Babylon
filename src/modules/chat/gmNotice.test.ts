import { describe, expect, it } from 'vitest';
import { markGmNotice, readGmNotice } from './gmNotice';

describe('the GM notice mark', () => {
  it('rides a "!" line through the server, which only trims the "!"', () => {
    const sent = markGmNotice('!Evento a las 22');
    const broadcast = sent.replace(/^!+/, ''); // OpenMU's SendGlobalNotificationAsync
    expect(readGmNotice(broadcast)).toBe('Evento a las 22');
  });

  it('leaves every other line alone', () => {
    expect(markGmNotice('hola')).toBe('hola');
    expect(markGmNotice('/move lorencia')).toBe('/move lorencia');
    expect(markGmNotice('!')).toBe('!');
  });

  it('reads an event notice as not the GM\'s', () => {
    expect(readGmNotice('corps invasion has ended.')).toBeNull();
  });
});
