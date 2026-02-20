/**
 * Dashboard Routes
 * 
 * Provides KPIs, alerts, and analytics for the dashboard.
 * All data is calculated from actual transactions:
 * - Stock levels from movements (not stored values)
 * - Sales/purchase totals from respective tables
 * - Outstanding balances from customer/supplier ledgers
 * 
 * Metrics Include:
 * - Inventory summary
 * - Production statistics
 * - Sales and receivables
 * - Purchase and payables
 * - Alerts (low stock, overdue, loss exceeded)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import {
    invoices, purchaseBills, productionBatches,
    customers, suppliers, stockMovements,
    rawMaterials, finishedProducts, bankCashAccounts
} from '../db/schema';
import { eq, sql, desc, and, lt, inArray } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { getAllRawMaterialsWithStock } from '../services/inventory.service';
import {
    getDashboardKPIs,
    getInventorySummary,
    getProfitabilityMetrics
} from '../services/precomputed.service';
import { cache as cacheService } from '../services/cache.service';

const router = Router();

// ============================================================
// INITIALIZATION ENDPOINT (AGGREGATED)
// ============================================================

/**
 * GET /dashboard/init
 * Get all essential master data and summaries for app initialization
 * Reduces network waterfall on load
 */
router.get('/init', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [
            customersData,
            suppliersData,
            accountsData,
            productsData,
            inventoryData
        ] = await Promise.all([
            db.select().from(customers).orderBy(customers.name),
            db.select().from(suppliers).orderBy(suppliers.name),
            db.select().from(bankCashAccounts).orderBy(bankCashAccounts.name),
            db.select({ id: finishedProducts.id, name: finishedProducts.name, code: finishedProducts.code }).from(finishedProducts).orderBy(finishedProducts.name),
            getInventorySummary()
        ]);

        res.json(successResponse({
            customers: customersData,
            suppliers: suppliersData,
            accounts: accountsData,
            products: productsData,
            inventory: inventoryData
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// KPIs ENDPOINT
// ============================================================

/**
 * GET /dashboard/kpis
 * Get all key performance indicators for dashboard
 */
router.get('/kpis', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [inventorySummary, kpis, productionStats] = await Promise.all([
            getInventorySummary(),
            getDashboardKPIs(),
            // Still need production stats for in-progress count (more volatile)
            db.select({
                inProgress: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} IN ('in-progress', 'partially-completed'))`,
                completed: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'completed')`,
                totalBatches: sql<number>`COUNT(*)`,
                totalOutput: sql<string>`COALESCE(SUM(${productionBatches.outputQuantity}::numeric), 0)`,
                exceededLoss: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.lossExceeded} = true)`,
            }).from(productionBatches)
        ]);

        const production = productionStats[0];

        const responseData = {
            inventory: {
                rawMaterialStock: inventorySummary.rawMaterials.totalStock,
                rawMaterialItems: inventorySummary.rawMaterials.totalItems,
                lowStockItems: inventorySummary.rawMaterials.lowStockCount,
                finishedGoodsStock: inventorySummary.finishedProducts.totalStock,
                finishedProductItems: inventorySummary.finishedProducts.totalItems,
                stockInProcess: inventorySummary.stockInProcess || 0,
                stockInBell: inventorySummary.stockInBell || 0,
                rawStockPurchased: inventorySummary.rawStockPurchased || 0,
                tradingStockPurchased: inventorySummary.tradingStockPurchased || 0,
                pendingRawStock: inventorySummary.pendingRawStock || 0,
                totalWeightLoss: inventorySummary.totalLoss || 0,
                avgProductionLoss: inventorySummary.avgProductionLoss || 0,
            },
            production: {
                inProgress: Number(production?.inProgress || 0),
                completed: Number(production?.completed || 0),
                totalBatches: Number(production?.totalBatches || 0),
                totalOutput: production?.totalOutput || '0',
                exceededLoss: Number(production?.exceededLoss || 0),
            },
            sales: {
                total: kpis.totalSales.toFixed(2),
                received: kpis.receivedAmount.toFixed(2),
                pendingReceivables: (kpis.totalSales - kpis.receivedAmount).toFixed(2),
                gstCollected: kpis.gstCollected.toFixed(2),
                invoiceCount: Number(kpis.pendingInvoices), // Note: pendingInvoices is count, totalSales is amount
            },
            purchases: {
                total: kpis.totalPurchases.toFixed(2),
                paid: kpis.paidAmount.toFixed(2),
                pendingPayables: (kpis.totalPurchases - kpis.paidAmount).toFixed(2),
                billCount: Number(kpis.pendingBills),
            },
            accounts: {
                bankBalance: kpis.bankBalance.toFixed(2),
                cashBalance: kpis.cashBalance.toFixed(2),
                totalBalance: (kpis.bankBalance + kpis.cashBalance).toFixed(2),
            },
            ledgers: {
                customerOutstanding: kpis.customerOutstanding.toFixed(2),
                supplierOutstanding: kpis.supplierOutstanding.toFixed(2),
                netPosition: (kpis.customerOutstanding - kpis.supplierOutstanding).toFixed(2),
            },
            profitability: kpis.profitability,
            assets: kpis.assets
        };

        res.json(successResponse(responseData));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /dashboard/profitability
 * Get dynamic profitability metrics for a date range
 */
router.get('/profitability', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { start, end } = req.query;
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (start) startDate = new Date(start as string);
        if (end) endDate = new Date(end as string);

        const metrics = await getProfitabilityMetrics(startDate, endDate);
        res.json(successResponse(metrics));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// ALERTS ENDPOINT
// ============================================================

/**
 * GET /dashboard/alerts
 * Get alerts for issues that need attention
 */
router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'dashboard:alerts';
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
            return res.json(successResponse(cachedData));
        }

        const alerts: any[] = [];

        // Low stock alerts
        // Use optimized batch fetch from inventory service
        const materialsWithStock = await getAllRawMaterialsWithStock();

        for (const material of materialsWithStock) {
            const stock = parseFloat(material.stock);
            const reorderLevel = parseFloat(material.reorderLevel || '100');

            if (stock < reorderLevel) {
                alerts.push({
                    type: 'low_stock',
                    severity: stock === 0 ? 'critical' : 'warning', // Critical if 0
                    title: `Low Stock: ${material.name}`,
                    message: `Current stock ${stock.toFixed(2)} kg is below reorder level of ${reorderLevel} kg`,
                    itemId: material.id,
                });
            }
        }

        // Production loss exceeded alerts
        const lossExceededBatches = await db
            .select()
            .from(productionBatches)
            .where(eq(productionBatches.lossExceeded, true))
            .orderBy(desc(productionBatches.completionDate))
            .limit(5);

        for (const batch of lossExceededBatches) {
            alerts.push({
                type: 'loss_exceeded',
                severity: 'warning',
                title: `Production Loss Exceeded: ${batch.code}`,
                message: `Loss of ${parseFloat(batch.lossPercentage || '0').toFixed(2)}% exceeds 5% threshold`,
                itemId: batch.id,
            });
        }

        // Overdue payments (pending for more than 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const overdueInvoices = await db
            .select()
            .from(invoices)
            .where(
                and(
                    eq(invoices.paymentStatus, 'Unpaid'),
                    lt(invoices.invoiceDate, thirtyDaysAgo)
                )
            )
            .limit(5);

        for (const invoice of overdueInvoices) {
            alerts.push({
                type: 'overdue_payment',
                severity: 'warning',
                title: `Overdue: ${invoice.invoiceNumber}`,
                message: `₹${parseFloat(invoice.balanceAmount || '0').toLocaleString()} pending from ${invoice.customerName}`,
                itemId: invoice.id,
            });
        }

        cacheService.set(cacheKey, alerts, 60 * 1000); // Cache for 1 minute
        res.json(successResponse(alerts));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// RECENT ACTIVITY
// ============================================================

/**
 * GET /dashboard/recent-activity
 * Get recent transactions and movements
 */
router.get('/recent-activity', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;

        // Get recent stock movements
        const movements = await db
            .select()
            .from(stockMovements)
            .orderBy(desc(stockMovements.createdAt))
            .limit(limit);

        // Format activities
        const activities = movements.map(m => ({
            id: m.id,
            type: m.movementType,
            description: m.reason,
            reference: m.referenceCode,
            quantity: m.movementType.includes('IN')
                ? `+${m.quantityIn} kg`
                : `-${m.quantityOut} kg`,
            timestamp: m.createdAt,
        }));

        res.json(successResponse(activities));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// MACHINE EFFICIENCY
// ============================================================

/**
 * GET /dashboard/machine-efficiency
 * Get production efficiency by machine
 */
router.get('/machine-efficiency', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'dashboard:machine-efficiency';
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
            return res.json(successResponse(cachedData));
        }

        const result = await db
            .select({
                machineId: productionBatches.machineId,
                totalBatches: sql<number>`COUNT(*)`,
                completedBatches: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'completed')`,
                totalInput: sql<string>`COALESCE(SUM(${productionBatches.inputQuantity}::numeric), 0)`,
                totalOutput: sql<string>`COALESCE(SUM(${productionBatches.outputQuantity}::numeric), 0)`,
                avgLoss: sql<string>`COALESCE(AVG(${productionBatches.lossPercentage}::numeric), 0)`,
            })
            .from(productionBatches)
            .groupBy(productionBatches.machineId);

        cacheService.set(cacheKey, result, 5 * 60 * 1000); // Cache for 5 minutes
        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

export default router;
