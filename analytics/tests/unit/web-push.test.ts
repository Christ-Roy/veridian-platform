import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// On mock le module web-push AVANT d'importer notre lib
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Pour tester avec/sans env vars on re-importe le module a chaque test
// via vi.importActual ou resetModules. Mais comme les vars sont lues au
// module-level, on utilise resetModules pour forcer la re-evaluation.

describe('web-push lib', () => {
  const ORIGINAL_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const ORIGINAL_PRIVATE = process.env.VAPID_PRIVATE_KEY;

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL_PUBLIC === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = ORIGINAL_PUBLIC;
    if (ORIGINAL_PRIVATE === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = ORIGINAL_PRIVATE;
  });

  it('isWebPushConfigured retourne false sans env vars', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { isWebPushConfigured } = await import('@/lib/web-push');
    expect(isWebPushConfigured()).toBe(false);
  });

  it('isWebPushConfigured retourne true avec les deux cles', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
    const { isWebPushConfigured } = await import('@/lib/web-push');
    expect(isWebPushConfigured()).toBe(true);
  });

  it('getVapidPublicKey retourne la cle env', async () => {
    process.env.VAPID_PUBLIC_KEY = 'my-vapid-public-key';
    process.env.VAPID_PRIVATE_KEY = 'my-vapid-private-key';
    const { getVapidPublicKey } = await import('@/lib/web-push');
    expect(getVapidPublicKey()).toBe('my-vapid-public-key');
  });

  it('getVapidPublicKey retourne vide sans env', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { getVapidPublicKey } = await import('@/lib/web-push');
    expect(getVapidPublicKey()).toBe('');
  });

  describe('sendPushNotification', () => {
    it('retourne ok:false sans config VAPID', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const { sendPushNotification } = await import('@/lib/web-push');
      const result = await sendPushNotification(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'Test', body: 'Hello' },
      );
      expect(result).toEqual({ ok: false, gone: false });
    });

    it('retourne ok:true quand sendNotification reussit', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
      const webpush = (await import('web-push')).default;
      (webpush.sendNotification as any).mockResolvedValueOnce({});
      const { sendPushNotification } = await import('@/lib/web-push');

      const result = await sendPushNotification(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'Test', body: 'Hello' },
      );
      expect(result).toEqual({ ok: true, gone: false });
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        JSON.stringify({ title: 'Test', body: 'Hello' }),
        { TTL: 86400 },
      );
    });

    it('retourne gone:true sur erreur 410', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
      const webpush = (await import('web-push')).default;
      const err = new Error('Gone') as any;
      err.statusCode = 410;
      (webpush.sendNotification as any).mockRejectedValueOnce(err);
      const { sendPushNotification } = await import('@/lib/web-push');

      const result = await sendPushNotification(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'Test', body: 'Hello' },
      );
      expect(result).toEqual({ ok: false, gone: true });
    });

    it('retourne gone:true sur erreur 404', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
      const webpush = (await import('web-push')).default;
      const err = new Error('Not Found') as any;
      err.statusCode = 404;
      (webpush.sendNotification as any).mockRejectedValueOnce(err);
      const { sendPushNotification } = await import('@/lib/web-push');

      const result = await sendPushNotification(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'Test', body: 'Hello' },
      );
      expect(result).toEqual({ ok: false, gone: true });
    });

    it('retourne ok:false, gone:false sur autre erreur', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
      const webpush = (await import('web-push')).default;
      const err = new Error('Network error') as any;
      err.statusCode = 500;
      (webpush.sendNotification as any).mockRejectedValueOnce(err);
      const { sendPushNotification } = await import('@/lib/web-push');

      const result = await sendPushNotification(
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'Test', body: 'Hello' },
      );
      expect(result).toEqual({ ok: false, gone: false });
    });
  });
});
