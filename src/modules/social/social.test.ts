import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location ??= { href: 'http://localhost/', search: '', hostname: 'localhost', protocol: 'http:' };
});

// Skills first: they keep the app import cycle in order (versions/shared/skills/readme.md).
await import('@versions/shared/skills/skillVisuals');
const { Social } = await import('./social');
const { GameOptions, setGameOption } = await import('@/controllers/settings');

describe('the System messages switch', () => {
  // The chat box's button (`m_bShowSystemMessages`) and Options share one saved setting (ours).
  it('is the saved chatSystemMessages option, on by default as the original', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
      removeItem: (k: string) => void saved.delete(k),
    });

    expect(Social.showSystemMessages).toBe(true);
    Social.toggle('showSystemMessages');
    expect(GameOptions.chatSystemMessages).toBe(false);
    expect(JSON.parse(saved.get('mu_options') ?? '{}').chatSystemMessages).toBe(false);

    setGameOption('chatSystemMessages', true);
    expect(Social.showSystemMessages).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('/move while the MU Helper runs', () => {
  it('is refused and never sent; sent again once the helper stops', async () => {
    const { MuHelper } = await import('../mu_helper');
    const { Session } = await import('../session');
    const { runInAction } = await import('mobx');
    const send = vi.spyOn(Session, 'sendToGS').mockImplementation(() => undefined);
    let clock = 1_000_000;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));

    runInAction(() => (MuHelper.active = true));
    expect(Social.sendChat('/move lorencia')).toBe(true);
    expect(send).not.toHaveBeenCalled();

    runInAction(() => (MuHelper.active = false));
    Social.sendChat('/move lorencia');
    expect(send).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('system lines in the top-left corner (ours)', () => {
  it('moves the system and error lines out of the log into the last three of the corner', async () => {
    const { ChatLineType } = await import('../chat/chat');
    expect(GameOptions.systemLinesCorner).toBe(true);
    setGameOption('systemLinesCorner', false);
    Social.chatLines = [];
    Social.addChatLine('Ana', 'hola', ChatLineType.Chat);
    for (const text of ['uno', 'dos', 'tres', 'cuatro']) Social.addChatLine('', text, ChatLineType.System);
    Social.addChatLine('', 'error', ChatLineType.Error);

    expect(Social.cornerSystemLines).toEqual([]);
    expect(Social.visibleChatLines).toHaveLength(6);

    setGameOption('systemLinesCorner', true);
    expect(Social.cornerSystemLines.map(l => l.text)).toEqual(['tres', 'cuatro', 'error']);
    expect(Social.visibleChatLines.map(l => l.text)).toEqual(['hola']);
    Social.chatLines = [];
  });
});
