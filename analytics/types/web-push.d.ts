declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface RequestOptions {
    TTL?: number;
    headers?: Record<string, string>;
    gcmAPIKey?: string;
    vapidDetails?: {
      subject: string;
      publicKey: string;
      privateKey: string;
    };
    contentEncoding?: string;
    proxy?: string;
    agent?: any;
    timeout?: number;
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<SendResult>;

  function setGCMAPIKey(apiKey: string): void;
  function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  export default {
    setVapidDetails,
    sendNotification,
    setGCMAPIKey,
    generateVAPIDKeys,
  };
}
