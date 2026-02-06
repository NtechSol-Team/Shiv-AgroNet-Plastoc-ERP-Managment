/**
 * Cache Service
 * 
 * Simple in-memory caching for master data to reduce DB load.
 * - TTL support
 * - Key-based invalidation
 */

type CacheEntry<T> = {
    value: T;
    expiry: number;
};

export class CacheService {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private defaultTTL: number = 300000; // 5 minutes

    /**
     * Get value from cache
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }

        return entry.value as T;
    }

    /**
     * Set value in cache
     * @param ttl Time to live in ms (default 5 mins)
     */
    set(key: string, value: any, ttl: number = this.defaultTTL): void {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }

    /**
     * Delete key from cache
     */
    del(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all keys (useful for testing/reset)
     */
    clear(): void {
        this.cache.clear();
    }
}

export const cache = new CacheService();
