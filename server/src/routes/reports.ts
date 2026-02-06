import { Router } from 'express';
import { db } from '../db/index';
import { productionBatches, salesInvoices, purchaseBills, purchaseBillItems, finishedProducts, rawMaterials, expenses, stockMovements } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { successResponse } from '../types/api';

const router = Router();

// Production loss report
router.get('/production-loss', async (req, res, next) => {
    try {
        const batches = await db.query.productionBatches.findMany({
            where: eq(productionBatches.status, 'completed'),
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
            },
            orderBy: [desc(productionBatches.completionDate)],
        });

        const report = batches.map(b => ({
            code: b.code,
            machine: b.machine?.name,
            rawMaterial: b.rawMaterial?.name,
            finishedProduct: b.finishedProduct?.name,
            inputQuantity: parseFloat(b.inputQuantity || '0'),
            outputQuantity: parseFloat(b.outputQuantity || '0'),
            lossPercentage: parseFloat(b.lossPercentage || '0'),
            lossExceeded: b.lossExceeded,
            completionDate: b.completionDate,
        }));

        const avgLoss = report.length > 0
            ? report.reduce((sum, r) => sum + r.lossPercentage, 0) / report.length
            : 0;

        res.json(successResponse({
            batches: report,
            summary: {
                totalBatches: report.length,
                averageLoss: avgLoss.toFixed(2),
                lossExceededCount: report.filter(r => r.lossExceeded).length,
            },
        }));
    } catch (error) {
        next(error);
    }
});

// Sales register
router.get('/sales', async (req, res, next) => {
    try {
        const invoices = await db.query.salesInvoices.findMany({
            with: {
                customer: true,
                items: {
                    with: {
                        finishedProduct: true
                    }
                },
                allocations: {
                    with: {
                        payment: true
                    }
                }
            },
            orderBy: [desc(salesInvoices.invoiceDate)],
        });

        const report = invoices.map(inv => ({
            code: inv.invoiceNumber,
            date: inv.invoiceDate,
            customer: inv.customer?.name,
            customerId: inv.customer?.id, // Added for filtering
            itemCount: inv.items?.length || 0,
            // Map items for detailed display
            items: inv.items.map(i => ({
                name: i.finishedProduct?.name || 'Unknown Item',
                quantity: parseFloat(i.quantity).toFixed(2)
            })),
            subtotal: parseFloat(inv.subtotal || '0'),
            gst: parseFloat(inv.totalTax || '0'),
            total: parseFloat(inv.grandTotal || '0'),
            status: inv.paymentStatus,
            allocations: inv.allocations.map(a => ({
                amount: parseFloat(a.amount),
                date: a.payment.date,
                receiptCode: a.payment.code
            }))
        }));

        const totalSales = report.reduce((sum, r) => sum + r.total, 0);
        const totalGst = report.reduce((sum, r) => sum + r.gst, 0);

        res.json(successResponse({
            invoices: report,
            summary: {
                totalInvoices: report.length,
                totalSales,
                totalGst,
                paid: report.filter(r => r.status === 'Paid').length,
                pending: report.filter(r => r.status !== 'Paid').length,
            },
        }));
    } catch (error) {
        next(error);
    }
});

// Purchase register
router.get('/purchases', async (req, res, next) => {
    try {
        const bills = await db.query.purchaseBills.findMany({
            with: {
                supplier: true,
                items: {
                    with: {
                        rawMaterial: true
                    }
                }
            },
            orderBy: [desc(purchaseBills.date)],
        });

        const report = bills.map(b => ({
            code: b.code,
            date: b.date,
            supplier: b.supplier?.name,
            supplierId: b.supplier?.id, // Added for filtering
            // Detailed items list
            items: b.items.map(i => ({
                name: i.rawMaterial?.name || 'Unknown Material',
                quantity: parseFloat(i.quantity).toFixed(2)
            })),
            quantity: b.items?.reduce((sum, i) => sum + parseFloat(i.quantity), 0) || 0,
            amount: parseFloat(b.total || '0'), // Total before tax
            gst: parseFloat(b.totalTax || '0'),
            total: parseFloat(b.grandTotal || '0'),
            status: b.paymentStatus,
        }));

        const totalPurchases = report.reduce((sum, r) => sum + r.total, 0);
        const totalQuantity = report.reduce((sum, r) => sum + r.quantity, 0);

        res.json(successResponse({
            bills: report,
            summary: {
                totalBills: report.length,
                totalPurchases,
                totalQuantity,
                paid: report.filter(r => r.status === 'Paid').length,
                pending: report.filter(r => r.status !== 'Paid').length,
            },
        }));
    } catch (error) {
        next(error);
    }
});

// Stock valuation
router.get('/stock-valuation', async (req, res, next) => {
    try {
        // 1. Fetch all items
        const rawMats = await db.query.rawMaterials.findMany();
        const finProds = await db.query.finishedProducts.findMany();

        // 2. Aggregate stock movements (Net Stock)
        // Group by RM
        const rmStock = await db
            .select({
                id: stockMovements.rawMaterialId,
                netStock: sql<string>`COALESCE(SUM(${stockMovements.quantityIn} - ${stockMovements.quantityOut}), 0)`
            })
            .from(stockMovements)
            .where(sql`${stockMovements.rawMaterialId} IS NOT NULL`)
            .groupBy(stockMovements.rawMaterialId);

        const rmStockMap = new Map(rmStock.map(r => [r.id, parseFloat(r.netStock)]));

        // Group by FP
        const fpStock = await db
            .select({
                id: stockMovements.finishedProductId,
                netStock: sql<string>`COALESCE(SUM(${stockMovements.quantityIn} - ${stockMovements.quantityOut}), 0)`
            })
            .from(stockMovements)
            .where(sql`${stockMovements.finishedProductId} IS NOT NULL`)
            .groupBy(stockMovements.finishedProductId);

        const fpStockMap = new Map(fpStock.map(r => [r.id, parseFloat(r.netStock)]));

        // 3. Fetch latest purchase rates for Raw Materials efficiently
        // DISTINCT ON is postgres specific, ensuring we get the latest row per rawMaterial
        const latestRates = await db
            .selectDistinctOn([purchaseBillItems.rawMaterialId], {
                rawMaterialId: purchaseBillItems.rawMaterialId,
                rate: purchaseBillItems.rate
            })
            .from(purchaseBillItems)
            .orderBy(purchaseBillItems.rawMaterialId, desc(purchaseBillItems.createdAt));

        const rateMap = new Map(latestRates.filter(r => r.rawMaterialId).map(r => [r.rawMaterialId!, parseFloat(r.rate)]));

        // 4. Build Data
        const valuationData = [
            ...rawMats.map(rm => {
                const stock = rmStockMap.get(rm.id) || 0;
                const rate = rateMap.get(rm.id) || 0;
                return {
                    category: 'Raw Material',
                    name: rm.name,
                    stock: stock.toFixed(2),
                    ratePerKg: rate.toFixed(2),
                    value: (stock * rate).toFixed(2)
                };
            }),
            ...finProds.map(fp => {
                const stock = fpStockMap.get(fp.id) || 0;
                const rate = parseFloat(fp.ratePerKg || '0');
                return {
                    category: 'Finished Good',
                    name: fp.name,
                    stock: stock.toFixed(2),
                    ratePerKg: rate.toFixed(2),
                    value: (stock * rate).toFixed(2)
                };
            })
        ];

        // Calculate summary
        const summary = {
            finishedGoodsValue: valuationData.filter(d => d.category === 'Finished Good').reduce((s, i) => s + parseFloat(i.value), 0),
            rawMaterialsValue: valuationData.filter(d => d.category === 'Raw Material').reduce((s, i) => s + parseFloat(i.value), 0),
            totalValue: valuationData.reduce((s, i) => s + parseFloat(i.value), 0),
            message: "Valuation based on stock movements and latest purchase rates"
        };

        res.json(successResponse({
            valuation: valuationData,
            summary
        }));
    } catch (error) {
        next(error);
    }
});

// Expense summary
router.get('/expenses', async (req, res, next) => {
    try {
        const expenseList = await db.query.expenses.findMany({
            with: { expenseHead: true },
            orderBy: [desc(expenses.date)],
        });

        const report = expenseList.map(e => ({
            code: e.code,
            date: e.date,
            head: e.expenseHead?.name,
            category: e.expenseHead?.category, // Added category to list detail
            description: e.description,
            amount: parseFloat(e.amount || '0'),
            paymentMode: e.paymentMode,
        }));

        // Group by expense head AND category
        const byHead: Record<string, { name: string, category: string, amount: number }> = {};

        for (const e of expenseList) {
            const headName = e.expenseHead?.name || 'Other';
            const category = e.expenseHead?.category || 'General';
            const key = `${headName}-${category}`;

            if (!byHead[key]) {
                byHead[key] = { name: headName, category, amount: 0 };
            }
            byHead[key].amount += parseFloat(e.amount || '0');
        }

        const totalExpenses = report.reduce((sum, r) => sum + r.amount, 0);

        res.json(successResponse({
            expenses: report,
            byCategory: Object.values(byHead), // Returns array of { name, category, amount }
            summary: {
                totalExpenses,
                expenseCount: report.length,
            },
        }));
    } catch (error) {
        next(error);
    }
});

export default router;
