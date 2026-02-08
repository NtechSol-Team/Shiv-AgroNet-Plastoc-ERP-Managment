/**
 * Precomputed Summary Service
 * 
 * Maintains cached summaries for inventory and dashboard KPIs.
 * Values are updated incrementally after transactions rather than
 * recalculated from scratch on every request.
 * 
 * This provides:
 * - Inventory summary: Total stock by type, value
 * - Account balances: Receivables, payables
 * - Dashboard KPIs: Sales, purchases, profitability
 */

import { db } from '../db';
import {
    stockMovements, rawMaterials, finishedProducts,
    invoices, purchaseBills, customers, suppliers,
    paymentTransactions
} from '../db/schema';
import { eq, sum, sql, and, count } from 'drizzle-orm';
import { cache } from './cache.service';

// ============================================================
// TYPES
// ============================================================

export interface InventorySummary {
    rawMaterials: {
        totalItems: number;
        totalStock: number;
        lowStockCount: number;
    };
    finishedProducts: {
        totalItems: number;
        totalStock: number;
        lowStockCount: number;
    };
    updatedAt: Date;
}

export interface AccountBalances {
    totalReceivables: number;  // Customer outstanding
    totalPayables: number;     // Supplier outstanding
    cashBalance: number;
    bankBalance: number;
    updatedAt: Date;
}

export interface DashboardKPIs {
    salesThisMonth: number;
    purchasesThisMonth: number;
    collectionsThisMonth: number;
    paymentsThisMonth: number;
    pendingInvoices: number;
    pendingBills: number;
    updatedAt: Date;
}

// ============================================================
// CACHE KEYS
// ============================================================

const CACHE_KEYS = {
    INVENTORY_SUMMARY: 'precomputed:inventory-summary',
    ACCOUNT_BALANCES: 'precomputed:account-balances',
    DASHBOARD_KPIS: 'precomputed:dashboard-kpis',
};

// ============================================================
// INVENTORY SUMMARY
// ============================================================

/**
 * Get inventory summary (from cache or compute)
 */
export async function getInventorySummary(): Promise<InventorySummary> {
    const cached = cache.get<InventorySummary>(CACHE_KEYS.INVENTORY_SUMMARY);
    if (cached) return cached;

    return await computeInventorySummary();
}

/**
 * Compute inventory summary from database
 */
async function computeInventorySummary(): Promise<InventorySummary> {
    const start = Date.now();

    // Get raw material stock totals in a single query
    const rmStockResult = await db
        .select({
            id: stockMovements.rawMaterialId,
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.itemType, 'raw_material'))
        .groupBy(stockMovements.rawMaterialId);

    // Get finished product stock totals in a single query
    const fpStockResult = await db
        .select({
            id: stockMovements.finishedProductId,
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.itemType, 'finished_product'))
        .groupBy(stockMovements.finishedProductId);

    // Get raw material count and reorder levels
    const rmItems = await db.select({
        id: rawMaterials.id,
        reorderLevel: rawMaterials.reorderLevel
    }).from(rawMaterials);

    // Get finished product count
    const fpItems = await db.select({ id: finishedProducts.id }).from(finishedProducts);

    // Create stock maps
    const rmStockMap = new Map<string, number>();
    rmStockResult.forEach(r => {
        if (r.id) {
            rmStockMap.set(r.id, parseFloat(r.totalIn) - parseFloat(r.totalOut));
        }
    });

    const fpStockMap = new Map<string, number>();
    fpStockResult.forEach(r => {
        if (r.id) {
            fpStockMap.set(r.id, parseFloat(r.totalIn) - parseFloat(r.totalOut));
        }
    });

    // Calculate totals
    let rmTotalStock = 0;
    let rmLowStockCount = 0;
    rmItems.forEach(rm => {
        const stock = rmStockMap.get(rm.id) || 0;
        rmTotalStock += stock;
        const reorder = parseFloat(rm.reorderLevel || '0');
        if (stock < reorder) rmLowStockCount++;
    });

    let fpTotalStock = 0;
    fpItems.forEach(fp => {
        fpTotalStock += fpStockMap.get(fp.id) || 0;
    });

    const summary: InventorySummary = {
        rawMaterials: {
            totalItems: rmItems.length,
            totalStock: rmTotalStock,
            lowStockCount: rmLowStockCount,
        },
        finishedProducts: {
            totalItems: fpItems.length,
            totalStock: fpTotalStock,
            lowStockCount: 0, // FG doesn't have reorder levels
        },
        updatedAt: new Date(),
    };

    // Cache for 5 minutes
    cache.set(CACHE_KEYS.INVENTORY_SUMMARY, summary, cache.TTL.COMPUTED);
    console.log(`📊 Inventory summary computed in ${Date.now() - start}ms`);

    return summary;
}

/**
 * Invalidate inventory summary cache (call after stock movements)
 */
export function invalidateInventorySummary(): void {
    cache.del(CACHE_KEYS.INVENTORY_SUMMARY);
}

// ============================================================
// ACCOUNT BALANCES
// ============================================================

/**
 * Get account balances (from cache or compute)
 */
export async function getAccountBalances(): Promise<AccountBalances> {
    const cached = cache.get<AccountBalances>(CACHE_KEYS.ACCOUNT_BALANCES);
    if (cached) return cached;

    return await computeAccountBalances();
}

/**
 * Compute account balances from database
 */
async function computeAccountBalances(): Promise<AccountBalances> {
    const start = Date.now();

    const [customerResult, supplierResult] = await Promise.all([
        // Total customer receivables
        db.select({
            total: sql<string>`COALESCE(SUM(${customers.outstanding}), 0)`
        }).from(customers),

        // Total supplier payables
        db.select({
            total: sql<string>`COALESCE(SUM(${suppliers.outstanding}), 0)`
        }).from(suppliers),
    ]);

    const balances: AccountBalances = {
        totalReceivables: parseFloat(customerResult[0]?.total || '0'),
        totalPayables: parseFloat(supplierResult[0]?.total || '0'),
        cashBalance: 0, // TODO: Calculate from bank_cash_accounts
        bankBalance: 0, // TODO: Calculate from bank_cash_accounts
        updatedAt: new Date(),
    };

    // Cache for 5 minutes
    cache.set(CACHE_KEYS.ACCOUNT_BALANCES, balances, cache.TTL.COMPUTED);
    console.log(`💰 Account balances computed in ${Date.now() - start}ms`);

    return balances;
}

/**
 * Invalidate account balances cache
 */
export function invalidateAccountBalances(): void {
    cache.del(CACHE_KEYS.ACCOUNT_BALANCES);
}

// ============================================================
// DASHBOARD KPIs
// ============================================================

/**
 * Get dashboard KPIs (from cache or compute)
 */
export async function getDashboardKPIs(): Promise<DashboardKPIs> {
    const cached = cache.get<DashboardKPIs>(CACHE_KEYS.DASHBOARD_KPIS);
    if (cached) return cached;

    return await computeDashboardKPIs();
}

/**
 * Compute dashboard KPIs
 */
async function computeDashboardKPIs(): Promise<DashboardKPIs> {
    const start = Date.now();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
        salesResult,
        purchasesResult,
        collectionsResult,
        paymentsResult,
        pendingInvoicesResult,
        pendingBillsResult
    ] = await Promise.all([
        // Sales this month (Confirmed invoices)
        db.select({
            total: sql<string>`COALESCE(SUM(${invoices.grandTotal}), 0)`
        }).from(invoices)
            .where(and(
                eq(invoices.status, 'Confirmed'),
                sql`${invoices.createdAt} >= ${startOfMonth}`
            )),

        // Purchases this month (Confirmed bills)
        db.select({
            total: sql<string>`COALESCE(SUM(${purchaseBills.grandTotal}), 0)`
        }).from(purchaseBills)
            .where(and(
                eq(purchaseBills.status, 'Confirmed'),
                sql`${purchaseBills.createdAt} >= ${startOfMonth}`
            )),

        // Collections this month (receipts from customers)
        db.select({
            total: sql<string>`COALESCE(SUM(${paymentTransactions.amount}), 0)`
        }).from(paymentTransactions)
            .where(and(
                eq(paymentTransactions.type, 'RECEIPT'),
                eq(paymentTransactions.partyType, 'customer'),
                sql`${paymentTransactions.createdAt} >= ${startOfMonth}`
            )),

        // Payments this month (payments to suppliers)
        db.select({
            total: sql<string>`COALESCE(SUM(${paymentTransactions.amount}), 0)`
        }).from(paymentTransactions)
            .where(and(
                eq(paymentTransactions.type, 'PAYMENT'),
                eq(paymentTransactions.partyType, 'supplier'),
                sql`${paymentTransactions.createdAt} >= ${startOfMonth}`
            )),

        // Pending invoices count
        db.select({
            count: count()
        }).from(invoices)
            .where(sql`${invoices.paymentStatus} IN ('Unpaid', 'Partial')`),

        // Pending bills count
        db.select({
            count: count()
        }).from(purchaseBills)
            .where(sql`${purchaseBills.paymentStatus} IN ('Unpaid', 'Partial')`),
    ]);

    const kpis: DashboardKPIs = {
        salesThisMonth: parseFloat(salesResult[0]?.total || '0'),
        purchasesThisMonth: parseFloat(purchasesResult[0]?.total || '0'),
        collectionsThisMonth: parseFloat(collectionsResult[0]?.total || '0'),
        paymentsThisMonth: parseFloat(paymentsResult[0]?.total || '0'),
        pendingInvoices: pendingInvoicesResult[0]?.count || 0,
        pendingBills: pendingBillsResult[0]?.count || 0,
        updatedAt: new Date(),
    };

    // Cache for 1 minute (dashboard data is more volatile)
    cache.set(CACHE_KEYS.DASHBOARD_KPIS, kpis, cache.TTL.VOLATILE);
    console.log(`📈 Dashboard KPIs computed in ${Date.now() - start}ms`);

    return kpis;
}

/**
 * Invalidate dashboard KPIs cache
 */
export function invalidateDashboardKPIs(): void {
    cache.del(CACHE_KEYS.DASHBOARD_KPIS);
}

// ============================================================
// BULK INVALIDATION
// ============================================================

/**
 * Invalidate all precomputed caches
 */
export function invalidateAllPrecomputed(): void {
    cache.invalidatePattern('precomputed:');
}
