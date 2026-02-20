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
    paymentTransactions, rawMaterialRolls, bankCashAccounts,
    productionBatches, bellItems, purchaseBillItems
} from '../db/schema';
import { eq, sum, sql, and, count, inArray } from 'drizzle-orm';
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
    stockInProcess: number;  // WIP from production floor
    stockInBell: number;     // Packaged stock ready for dispatch
    rawStockPurchased: number; // Total quantity of raw material purchased
    tradingStockPurchased: number; // Total quantity of finished goods purchased
    pendingRawStock: number; // Invoice qty - roll weight difference
    totalLoss: number; // Total loss quantity from production batches
    avgProductionLoss: number; // Average loss percentage from completed batches
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
    // Added for full dashboard coverage
    totalSales: number;
    receivedAmount: number;
    totalPurchases: number;
    paidAmount: number;
    gstCollected: number;
    bankBalance: number;
    cashBalance: number;
    customerOutstanding: number;
    supplierOutstanding: number;
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

    // Get raw material stock totals from ROLLS (Source of Truth)
    const rmStockResult = await db
        .select({
            id: rawMaterialRolls.rawMaterialId,
            totalWeight: sql<string>`COALESCE(SUM(${rawMaterialRolls.netWeight}), 0)`,
        })
        .from(rawMaterialRolls)
        .where(eq(rawMaterialRolls.status, 'In Stock'))
        .groupBy(rawMaterialRolls.rawMaterialId);

    // Get finished product stock totals in a single query (From movements)
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
            rmStockMap.set(r.id, parseFloat(r.totalWeight));
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
        const stock = fpStockMap.get(fp.id) || 0;
        fpTotalStock += Math.max(0, stock); // clamp per-product to avoid negative totals
    });

    // 4. Calculate WIP (Stock in Process)
    // Formula: input - output for all in-progress and partial batches
    // (Loss is finalized at completion, so we keep it in WIP until then)
    const wipResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(
                (${productionBatches.inputQuantity}::numeric) - 
                (COALESCE(${productionBatches.outputQuantity}::numeric, 0))
            ), 0)`
        })
        .from(productionBatches)
        .where(inArray(productionBatches.status, ['in-progress', 'partially-completed']));

    // 4b. Calculate Total Loss (Cumulative)
    const lossResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${productionBatches.lossQuantity}::numeric), 0)`
        })
        .from(productionBatches);

    // 4c. Calculate Average Loss from Completed Batches
    const completedBatchStats = await db
        .select({
            totalLoss: sql<string>`COALESCE(SUM(${productionBatches.lossQuantity}::numeric), 0)`,
            totalInput: sql<string>`COALESCE(SUM(${productionBatches.inputQuantity}::numeric), 0)`,
        })
        .from(productionBatches)
        .where(eq(productionBatches.status, 'completed'));

    const totalCompletedInput = parseFloat(completedBatchStats[0]?.totalInput || '0');
    const totalCompletedLoss = parseFloat(completedBatchStats[0]?.totalLoss || '0');
    const avgProductionLoss = totalCompletedInput > 0 ? (totalCompletedLoss / totalCompletedInput) * 100 : 0;

    // 5. Calculate Bell Stock
    const bellStockResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${bellItems.grossWeight}), 0)`
        })
        .from(bellItems)
        .where(eq(bellItems.status, 'Available'));

    // 6. Calculate Purchase Quantities
    const rawPurchaseResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${purchaseBillItems.quantity}), 0)`
        })
        .from(purchaseBillItems)
        .innerJoin(purchaseBills, eq(purchaseBillItems.billId, purchaseBills.id))
        .where(and(
            eq(purchaseBills.type, 'RAW_MATERIAL'),
            eq(purchaseBills.status, 'Confirmed')
        ));

    const tradingPurchaseResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${purchaseBillItems.quantity}), 0)`
        })
        .from(purchaseBillItems)
        .innerJoin(purchaseBills, eq(purchaseBillItems.billId, purchaseBills.id))
        .where(and(
            eq(purchaseBills.type, 'FINISHED_GOODS'),
            eq(purchaseBills.status, 'Confirmed')
        ));

    // 7. Calculate Pending Raw Stock (Invoice Qty - Roll Weight)
    const pendingRawStockResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(
                (${purchaseBillItems.quantity}::numeric)
            ), 0)`,
            totalRollWeight: sql<string>`COALESCE(SUM(
                DISTINCT (${purchaseBills.totalRollWeight}::numeric)
            ), 0)`
        })
        .from(purchaseBillItems)
        .innerJoin(purchaseBills, eq(purchaseBillItems.billId, purchaseBills.id))
        .where(and(
            eq(purchaseBills.type, 'RAW_MATERIAL'),
            eq(purchaseBills.status, 'Confirmed')
        ));

    // For pending raw stock, we need to be careful with the SUM of DISTINCT for roll weight 
    // because one bill has many items. 
    // A better way is to query bills directly for total roll weight.
    const billsWeightResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${purchaseBills.totalRollWeight}::numeric), 0)`
        })
        .from(purchaseBills)
        .where(and(
            eq(purchaseBills.type, 'RAW_MATERIAL'),
            eq(purchaseBills.status, 'Confirmed')
        ));

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
        stockInProcess: parseFloat(wipResult[0]?.total || '0'),
        stockInBell: parseFloat(bellStockResult[0]?.total || '0'),
        rawStockPurchased: parseFloat(rawPurchaseResult[0]?.total || '0'),
        tradingStockPurchased: parseFloat(tradingPurchaseResult[0]?.total || '0'),
        pendingRawStock: parseFloat(rawPurchaseResult[0]?.total || '0') - parseFloat(billsWeightResult[0]?.total || '0'),
        totalLoss: parseFloat(lossResult[0]?.total || '0'),
        avgProductionLoss: avgProductionLoss,
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
        pendingBillsResult,
        allSalesResult,
        allPurchasesResult,
        accountsResult,
        customerOutstandingResult,
        supplierOutstandingResult
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

        // All-time Sales Stats
        db.select({
            total: sql<string>`COALESCE(SUM(${invoices.grandTotal}::numeric), 0)`,
            received: sql<string>`COALESCE(SUM(${invoices.paidAmount}::numeric), 0)`,
            gstCollected: sql<string>`COALESCE(SUM(${invoices.totalTax}::numeric), 0)`,
        }).from(invoices).where(sql`${invoices.status} IN ('Confirmed', 'Approved')`),

        // All-time Purchase Stats
        db.select({
            total: sql<string>`COALESCE(SUM(${purchaseBills.grandTotal}::numeric), 0)`,
            paid: sql<string>`COALESCE(SUM(${purchaseBills.paidAmount}::numeric), 0)`,
        }).from(purchaseBills).where(eq(purchaseBills.status, 'Confirmed')),

        // Bank/Cash Balances
        db.select({
            bankBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Bank'), 0)`,
            cashBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Cash'), 0)`,
        }).from(bankCashAccounts),

        // Customer Outstanding
        db.select({
            total: sql<string>`COALESCE(SUM(${customers.outstanding}::numeric), 0)`,
        }).from(customers),

        // Supplier Outstanding
        db.select({
            total: sql<string>`COALESCE(SUM(${suppliers.outstanding}::numeric), 0)`,
        }).from(suppliers),
    ]);

    const kpis: DashboardKPIs = {
        salesThisMonth: parseFloat(salesResult[0]?.total || '0'),
        purchasesThisMonth: parseFloat(purchasesResult[0]?.total || '0'),
        collectionsThisMonth: parseFloat(collectionsResult[0]?.total || '0'),
        paymentsThisMonth: parseFloat(paymentsResult[0]?.total || '0'),
        pendingInvoices: pendingInvoicesResult[0]?.count || 0,
        pendingBills: pendingBillsResult[0]?.count || 0,
        totalSales: parseFloat(allSalesResult[0]?.total || '0'),
        receivedAmount: parseFloat(allSalesResult[0]?.received || '0'),
        totalPurchases: parseFloat(allPurchasesResult[0]?.total || '0'),
        paidAmount: parseFloat(allPurchasesResult[0]?.paid || '0'),
        gstCollected: parseFloat(allSalesResult[0]?.gstCollected || '0'),
        bankBalance: parseFloat(accountsResult[0]?.bankBalance || '0'),
        cashBalance: parseFloat(accountsResult[0]?.cashBalance || '0'),
        customerOutstanding: parseFloat(customerOutstandingResult[0]?.total || '0'),
        supplierOutstanding: parseFloat(supplierOutstandingResult[0]?.total || '0'),
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
