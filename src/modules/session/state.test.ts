import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

const { Session } = await import('./state');

describe('Session.sendToGS', () => {
  it('sends only the bytes its DataView covers, not the whole buffer under it', () => {
    const sent: Uint8Array[] = [];
    Session.gsSocket = { readyState: WebSocket.OPEN, send: (p: Uint8Array) => sent.push(p) } as unknown as WebSocket;
    const buffer = new Uint8Array([9, 9, 9, 9, 0xc1, 4, 0xe8, 0, 9, 9]).buffer;

    Session.sendToGS(new DataView(buffer, 4, 4));
    Session.gsSocket = undefined;

    expect(sent).toHaveLength(1);
    expect(sent[0].byteLength).toBe(4);
    expect([sent[0][0], sent[0][1]]).toEqual([0xc1, 4]);
  });
});

// CLoginWin::CancelLogin (LoginWin.cpp:416-427): the game server goes, the connect server is
// dialled again and the server list shows; the typed fields stay.
describe('Session.cancelLogin', () => {
  it('goes back to the server list', async () => {
    const { AppState, UIState } = await import('@/controllers/interface/uiState');
    const dial = vi.spyOn(Session, 'connectToConnectServer').mockImplementation(() => undefined);
    const close = vi.fn();
    Session.gsSocket = { close } as unknown as WebSocket;
    Session.username = 'hero';
    Session.loginError = 'Wrong password';
    AppState.uiState = UIState.Login;

    Session.cancelLogin();

    expect(close).toHaveBeenCalled();
    expect(Session.gsSocket).toBeUndefined();
    expect(dial).toHaveBeenCalled();
    expect(AppState.uiState).toBe(UIState.Servers);
    expect(Session.loginError).toBeUndefined();
    expect(Session.username).toBe('hero');
  });
});

// A session left open in another tab held the account for 17 minutes while the player was told
// "already connected" 15 times; told of the new login, it now steps aside so the retry gets in.
describe('Session.yieldToNewLogin', () => {
  it('closes the game server on purpose, without a resume, and says why on the server list', async () => {
    const { AppState, UIState } = await import('@/controllers/interface/uiState');
    const dial = vi.spyOn(Session, 'connectToConnectServer').mockImplementation(() => undefined);
    const resume = vi.fn(() => true);
    Session.resumeHook = resume;
    const close = vi.fn();
    Session.gsSocket = { close } as unknown as WebSocket;
    AppState.uiState = UIState.World;

    Session.yieldToNewLogin();

    expect(close).toHaveBeenCalled();
    expect(Session.gsSocket).toBeUndefined();
    expect(resume).not.toHaveBeenCalled();
    expect(dial).toHaveBeenCalled();
    expect(AppState.uiState).toBe(UIState.Servers);
    expect(Session.loginError).toContain('another');
  });
});

// OpenMU reads every login of 42 bytes or more as LoginLongPassword (20-byte password, LogInHandlerPlugIn):
// a 10-character password has no terminating zero in the short packet, so the bytes after it joined it.
describe('Session.loginRequest', () => {
  const sendLogin = async (password: string) => {
    const { Xor3Byte } = await import('@/controllers/net/encryption/xor3');
    const sent: Uint8Array[] = [];
    // Before Xor32: the packet as the client builds it.
    const spy = vi.spyOn(Session, 'sendToGS').mockImplementation(v => void sent.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
    Session.loginRequest('hero', password);
    spy.mockRestore();
    const field = sent[0].slice(14, 34);
    Xor3Byte(field);
    return { length: sent[0].byteLength, password: new TextDecoder().decode(field.slice(0, field.indexOf(0))) };
  };

  it('keeps the short packet for a password under 10 characters', async () => {
    expect((await sendLogin('abc123')).length).toBe(50);
  });

  it('sends a 10-character password in the long packet, ended by a zero', async () => {
    expect(await sendLogin('abcdefghij')).toEqual({ length: 60, password: 'abcdefghij' });
  });
});

// A second ConnectionInfo (the server list clicked twice, a resume) must not leave the first socket
// open: OpenMU keeps it as a player, and every /post then reaches this client twice.
describe('Session.connectToGameServer', () => {
  it('closes the game-server socket it replaces', () => {
    class FakeSocket {
      static OPEN = 1;
      readyState = 0;
      binaryType = '';
      addEventListener() {}
      close() {}
      send() {}
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    const close = vi.fn();
    Session.gsSocket = { close } as unknown as WebSocket;

    Session.connectToGameServer('127.0.0.1', 55901);

    expect(close).toHaveBeenCalled();
    expect(Session.gsSocket).toBeInstanceOf(FakeSocket);
    Session.disconnectFromGameServer();
    vi.unstubAllGlobals();
  });
});
