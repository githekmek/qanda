declare module "web-push" {
  type PushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  type SendOptions = {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  };
  type WebPush = {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: PushSubscription, payload?: string, options?: SendOptions): Promise<unknown>;
  };
  const webpush: WebPush;
  export default webpush;
}
