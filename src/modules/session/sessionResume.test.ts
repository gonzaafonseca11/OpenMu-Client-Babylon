import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { Session } = await import('./state');
const { SessionResume } = await import('./sessionResume');

/** The packets the resume sends, as [code, subcode]. */
function capture() {
  const sent: number[][] = [];
  vi.spyOn(Session, 'sendToGS').mockImplementation(v => void sent.push([v.getUint8(2), v.getUint8(3)]));
  return sent;
}

afterEach(() => {
  SessionResume.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SessionResume.onLoginOk', () => {
  // OpenMU selects only from the character list (CharacterSelection state); the original asks for it after
  // every login. Selecting straight after the login left the account logged in, the character never back.
  it('asks for the character list before selecting the character', () => {
    const sent = capture();
    SessionResume.remember('hero');
    SessionResume.step = 'logging-in';

    expect(SessionResume.onLoginOk()).toBe(true);

    expect(sent).toEqual([
      [0xf3, 0x00],
      [0xf3, 0x03],
    ]);
  });

  it('gives up and closes the socket when the character is not back in 15 s', () => {
    vi.useFakeTimers();
    capture();
    const close = vi.spyOn(Session, 'disconnectFromGameServer').mockImplementation(() => undefined);
    vi.spyOn(Session, 'playOnline').mockImplementation(() => undefined);
    SessionResume.remember('hero');
    SessionResume.step = 'logging-in';
    SessionResume.onLoginOk();

    vi.advanceTimersByTime(15000);

    expect(close).toHaveBeenCalled();
    expect(SessionResume.active).toBe(false);
  });
});
