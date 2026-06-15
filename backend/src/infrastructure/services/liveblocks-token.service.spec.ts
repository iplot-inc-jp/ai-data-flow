import { LiveblocksTokenService } from './liveblocks-token.service';

describe('LiveblocksTokenService', () => {
  const ORIGINAL = process.env.LIVEBLOCKS_SECRET_KEY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.LIVEBLOCKS_SECRET_KEY;
    else process.env.LIVEBLOCKS_SECRET_KEY = ORIGINAL;
  });

  it('isConfigured reflects the env var', () => {
    const svc = new LiveblocksTokenService();
    delete process.env.LIVEBLOCKS_SECRET_KEY;
    expect(svc.isConfigured).toBe(false);
    process.env.LIVEBLOCKS_SECRET_KEY = 'sk_test_x';
    expect(svc.isConfigured).toBe(true);
  });

  it('mintToken throws a clear error when the secret is not configured', async () => {
    const svc = new LiveblocksTokenService();
    delete process.env.LIVEBLOCKS_SECRET_KEY;
    await expect(
      svc.mintToken({
        userId: 'u1',
        userInfo: { name: 'A', email: 'a@x.com', avatarUrl: null, color: '#fff' },
        roomId: 'project:p1',
        fullAccess: true,
      }),
    ).rejects.toThrow(/LIVEBLOCKS_SECRET_KEY/);
  });
});
