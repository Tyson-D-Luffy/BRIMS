import NodeCache from "node-cache";

// Cache for 5 minutes by default
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export class CacheService {
  static get<T>(key: string): T | undefined {
    return cache.get<T>(key);
  }

  static set<T>(key: string, value: T, ttl?: number): boolean {
    return cache.set(key, value, ttl || 300);
  }

  static del(key: string): number {
    return cache.del(key);
  }

  static flush(): void {
    cache.flushAll();
  }
}
