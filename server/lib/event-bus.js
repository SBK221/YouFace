import Redis from 'ioredis';

export async function createEventBus(redisUrl) {
  const listeners = new Map();
  let publisher = null;
  let subscriber = null;
  const channel = 'youface:events';

  const dispatch = event => {
    const set = listeners.get(event.userId);
    if (!set) return;
    for (const listener of set) listener(event);
  };

  if (redisUrl) {
    publisher = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    subscriber = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await publisher.connect();
      await subscriber.connect();
      await subscriber.subscribe(channel);
      subscriber.on('message', (_channel, payload) => {
        try { dispatch(JSON.parse(payload)); } catch {}
      });
    } catch (error) {
      console.warn('[redis] event bus fallback to local mode:', error.message);
      await publisher.quit().catch(() => {});
      await subscriber.quit().catch(() => {});
      publisher = null;
      subscriber = null;
    }
  }

  return {
    subscribe(userId, listener) {
      if (!listeners.has(userId)) listeners.set(userId, new Set());
      listeners.get(userId).add(listener);
      return () => {
        const set = listeners.get(userId);
        set?.delete(listener);
        if (!set?.size) listeners.delete(userId);
      };
    },
    async publish(event) {
      if (publisher) await publisher.publish(channel, JSON.stringify(event));
      else dispatch(event);
    },
    async close() {
      await publisher?.quit().catch(() => {});
      await subscriber?.quit().catch(() => {});
    }
  };
}
