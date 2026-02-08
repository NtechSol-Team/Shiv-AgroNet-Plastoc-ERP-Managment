/**
 * Enhanced Cache Service
 * 
 * In-memory caching for master data and precomputed values.
 * Features:
 * - Configurable TTL (default 30 minutes for masters)
 * - Startup warmup for critical data
 * - Pattern-based invalidation
 * - Statistics tracking
 */

import { db } from '../db';
import { rawMaterials, finishedProducts, customers, suppliers, bankCashAccounts, expenseHeads, machines } from '../db/schema';

type CacheEntry<T> = {
    value: T;
    expiry: number;
    hits: number;
};

type CacheStats = {
    hits: number;
    misses: number;
    size: number;
};

export class CacheService {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private stats: CacheStats = { hits: 0, misses: 0, size: 0 };

    // 30 minutes for masters (they rarely change)
    private readonly MASTER_TTL = 30 * 60 * 1000;
    // 5 minutes for computed data
    private readonly COMPUTED_TTL = 5 * 60 * 1000;
    // 1 minute for volatile data
    private readonly VOLATILE_TTL = 60 * 1000;

    /**
     * Get value from cache
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        entry.hits++;
        this.stats.hits++;
        return entry.value as T;
    }

    /**
     * Set value in cache
     */
    set(key: string, value: any, ttl: number = this.MASTER_TTL): void {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl,
            hits: 0
        });
        this.stats.size = this.cache.size;
    }

    /**
     * Delete key from cache
     */
    del(key: string): void {
        this.cache.delete(key);
        this.stats.size = this.cache.size;
    }

    /**
     * Delete all keys matching a prefix pattern
     */
    invalidatePattern(prefix: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
        this.stats.size = this.cache.size;
    }

    /**
     * Clear all keys
     */
    clear(): void {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, size: 0 };
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats & { hitRate: string } {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%'
        };
    }

    /**
     * Warmup cache with all master data at startup
     * Call this after DB connection is established
     */
    async warmup(): Promise<void> {
        console.log('🔥 Cache warmup starting...');
        const start = Date.now();

        try {
            // Load all masters in parallel
            const [
                rawMaterialsData,
                finishedProductsData,
                customersData,
                suppliersData,
                accountsData,
                expenseHeadsData,
                machinesData
            ] = await Promise.all([
                db.select().from(rawMaterials),
                db.select().from(finishedProducts),
                db.select().from(customers),
                db.select().from(suppliers),
                db.select().from(bankCashAccounts),
                db.select().from(expenseHeads),
                db.select().from(machines)
            ]);

            // Cache raw data (without stock - that's computed separately)
            this.set('masters:raw-materials:base', rawMaterialsData, this.MASTER_TTL);
            this.set('masters:finished-products:base', finishedProductsData, this.MASTER_TTL);
            this.set('masters:customers', customersData, this.MASTER_TTL);
            this.set('masters:suppliers', suppliersData, this.MASTER_TTL);
            this.set('masters:accounts', accountsData, this.MASTER_TTL);
            this.set('masters:expense-heads', expenseHeadsData, this.MASTER_TTL);
            this.set('masters:machines', machinesData, this.MASTER_TTL);

            const elapsed = Date.now() - start;
            console.log(`✅ Cache warmup complete in ${elapsed}ms`);
            console.log(`   Loaded: ${rawMaterialsData.length} raw materials, ${finishedProductsData.length} products`);
            console.log(`   Loaded: ${customersData.length} customers, ${suppliersData.length} suppliers`);
            console.log(`   Loaded: ${accountsData.length} accounts, ${expenseHeadsData.length} expense heads`);
        } catch (error) {
            console.error('❌ Cache warmup failed:', error);
        }
    }

    /**
     * Get TTL constants for external use
     */
    get TTL() {
        return {
            MASTER: this.MASTER_TTL,
            COMPUTED: this.COMPUTED_TTL,
            VOLATILE: this.VOLATILE_TTL
        };
    }
}

export const cache = new CacheService();
