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
import { getInventorySummary, getAllRawMaterialsWithStock } from '../services/inventory.service';
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
        const cacheKey = 'dashboard:kpis';
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
            return res.json(successResponse(cachedData));
        }

        // Run all queries in parallel for performance
        const [
            inventorySummary,
            productionStats,
            salesStats,
            purchaseStats,
            accountBalances,
            customerOutstanding,
            supplierOutstanding,
        ] = await Promise.all([
            // Inventory from movements
            getInventorySummary(),

            // Production stats
            db.select({
                inProgress: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'in-progress')`,
                completed: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'completed')`,
                totalBatches: sql<number>`COUNT(*)`,
                totalOutput: sql<string>`COALESCE(SUM(${productionBatches.outputQuantity}::numeric), 0)`,
                exceededLoss: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.lossExceeded} = true)`,
            }).from(productionBatches),

            // Sales stats (confirmed only)
            db.select({
                total: sql<string>`COALESCE(SUM(${invoices.grandTotal}::numeric), 0)`,
                received: sql<string>`COALESCE(SUM(${invoices.paidAmount}::numeric), 0)`,
                gstCollected: sql<string>`COALESCE(SUM(${invoices.totalTax}::numeric), 0)`,
                invoiceCount: sql<number>`COUNT(*)`,
                paidCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.paymentStatus} = 'Paid')`,
                unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.paymentStatus} = 'Unpaid')`,
            }).from(invoices).where(inArray(invoices.status, ['Confirmed', 'Approved'])),

            // Purchase stats (confirmed only)
            db.select({
                total: sql<string>`COALESCE(SUM(${purchaseBills.grandTotal}::numeric), 0)`,
                paid: sql<string>`COALESCE(SUM(${purchaseBills.paidAmount}::numeric), 0)`,
                billCount: sql<number>`COUNT(*)`,
            }).from(purchaseBills).where(eq(purchaseBills.status, 'Confirmed')),

            // Bank/Cash balances
            db.select({
                bankBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Bank'), 0)`,
                cashBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Cash'), 0)`,
                bankAccounts: sql<number>`COUNT(*) FILTER (WHERE ${bankCashAccounts.type} = 'Bank')`,
                cashAccounts: sql<number>`COUNT(*) FILTER (WHERE ${bankCashAccounts.type} = 'Cash')`,
            }).from(bankCashAccounts),

            // Customer outstanding
            db.select({
                total: sql<string>`COALESCE(SUM(${customers.outstanding}::numeric), 0)`,
            }).from(customers),

            // Supplier outstanding
            db.select({
                total: sql<string>`COALESCE(SUM(${suppliers.outstanding}::numeric), 0)`,
            }).from(suppliers),
        ]);

        // Process results
        const production = productionStats[0];
        const sales = salesStats[0];
        const purchases = purchaseStats[0];
        const accounts = accountBalances[0];

        const totalSales = parseFloat(sales?.total || '0');
        const receivedAmount = parseFloat(sales?.received || '0');
        const totalPurchases = parseFloat(purchases?.total || '0');
        const paidAmount = parseFloat(purchases?.paid || '0');
        const bankBalance = parseFloat(accounts?.bankBalance || '0');
        const cashBalance = parseFloat(accounts?.cashBalance || '0');
        const customerOutstandingTotal = parseFloat(customerOutstanding[0]?.total || '0');
        const supplierOutstandingTotal = parseFloat(supplierOutstanding[0]?.total || '0');

        const responseData = {
            inventory: {
                rawMaterialStock: inventorySummary.rawMaterialStock,
                rawMaterialItems: inventorySummary.rawMaterialCount,
                lowStockItems: inventorySummary.lowStockCount,
                finishedGoodsStock: inventorySummary.finishedGoodsStock,
                finishedProductItems: inventorySummary.finishedGoodsCount,
            },
            production: {
                inProgress: Number(production?.inProgress || 0),
                completed: Number(production?.completed || 0),
                totalBatches: Number(production?.totalBatches || 0),
                totalOutput: production?.totalOutput || '0',
                exceededLoss: Number(production?.exceededLoss || 0),
            },
            sales: {
                total: totalSales.toFixed(2),
                received: receivedAmount.toFixed(2),
                pendingReceivables: (totalSales - receivedAmount).toFixed(2),
                gstCollected: sales?.gstCollected || '0',
                invoiceCount: Number(sales?.invoiceCount || 0),
                paidCount: Number(sales?.paidCount || 0),
                unpaidCount: Number(sales?.unpaidCount || 0),
            },
            purchases: {
                total: totalPurchases.toFixed(2),
                paid: paidAmount.toFixed(2),
                pendingPayables: (totalPurchases - paidAmount).toFixed(2),
                billCount: Number(purchases?.billCount || 0),
            },
            accounts: {
                bankBalance: bankBalance.toFixed(2),
                cashBalance: cashBalance.toFixed(2),
                totalBalance: (bankBalance + cashBalance).toFixed(2),
                bankAccounts: Number(accounts?.bankAccounts || 0),
                cashAccounts: Number(accounts?.cashAccounts || 0),
            },
            ledgers: {
                customerOutstanding: customerOutstandingTotal.toFixed(2),
                supplierOutstanding: supplierOutstandingTotal.toFixed(2),
                netPosition: (customerOutstandingTotal - supplierOutstandingTotal).toFixed(2),
            },
        };

        cacheService.set(cacheKey, responseData, 60 * 1000); // Cache for 1 minute
        res.json(successResponse(responseData));
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

        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

export default router;
