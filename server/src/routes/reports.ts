import { Router } from 'express';
import { db } from '../db/index';
import { productionBatches, salesInvoices, purchaseBills, purchaseBillItems, finishedProducts, rawMaterials, expenses, stockMovements, customers, suppliers } from '../db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
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
                name: i.materialName || i.rawMaterial?.name || 'Unknown Material',
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

// Ledger Summary (Consolidated for all customers or all suppliers)
router.get('/ledger-summary/:type', async (req, res, next) => {
    try {
        const { type } = req.params;
        if (type !== 'customer' && type !== 'supplier') {
            return res.status(400).json({ success: false, message: 'Invalid party type' });
        }

        if (type === 'customer') {
            const data = await db.query.customers.findMany({
                orderBy: [desc(customers.outstanding)],
            });
            res.json(successResponse(data));
        } else {
            const data = await db.query.suppliers.findMany({
                orderBy: [desc(suppliers.outstanding)],
            });
            res.json(successResponse(data));
        }
    } catch (error) {
        next(error);
    }
});

// Monthly Profitability / Economics Analysis
router.get('/monthly-economics', async (req, res, next) => {
    try {
        const { month } = req.query; // e.g. "2024-03"

        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (month !== 'all') {
            if (month) {
                const [year, m] = (month as string).split('-');
                startDate = new Date(parseInt(year), parseInt(m) - 1, 1);
                endDate = new Date(parseInt(year), parseInt(m), 0, 23, 59, 59, 999);
            } else {
                // Default to current month
                const now = new Date();
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            }
        }

        const dateQuery = startDate && endDate ? and(
            sql`${sql.raw('date')} >= ${startDate.toISOString()}`,
            sql`${sql.raw('date')} <= ${endDate.toISOString()}`
        ) : undefined;
        const invoiceDateQuery = startDate && endDate ? and(
            sql`invoice_date >= ${startDate.toISOString()}`,
            sql`invoice_date <= ${endDate.toISOString()}`
        ) : undefined;
        const completionDateQuery = startDate && endDate ? and(
            sql`completion_date >= ${startDate.toISOString()}`,
            sql`completion_date <= ${endDate.toISOString()}`
        ) : undefined;

        // 1. Total Raw Material Purchases (Taxable Amount)
        const purchaseResult = await db
            .select({ totalValue: sql<string>`COALESCE(SUM(subtotal), 0)` })
            .from(purchaseBills)
            .where(and(
                startDate && endDate ? sql`date >= ${startDate.toISOString()}` : undefined,
                startDate && endDate ? sql`date <= ${endDate.toISOString()}` : undefined,
                eq(purchaseBills.status, 'Confirmed')
            ));

        const totalPurchases = parseFloat(purchaseResult[0]?.totalValue || '0');

        // 2. Total Expenses & Breakdown
        const allExpenses = await db.query.expenses.findMany({
            where: dateQuery,
            with: { expenseHead: true }
        });

        let totalExpenses = 0;
        const expenseBreakdownMap = new Map<string, number>();

        allExpenses.forEach(exp => {
            const amount = parseFloat(exp.amount || '0');
            totalExpenses += amount;

            const headName = exp.expenseHead?.name || 'Other';
            expenseBreakdownMap.set(headName, (expenseBreakdownMap.get(headName) || 0) + amount);
        });

        const expenseBreakdown = Array.from(expenseBreakdownMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value); // Sort by highest expense first

        // 3. Total Finished Goods Produced (KG)
        const productionResult = await db
            .select({ totalKg: sql<string>`COALESCE(SUM(output_quantity), 0)` })
            .from(productionBatches)
            .where(and(
                completionDateQuery,
                eq(productionBatches.status, 'completed')
            ));

        const totalProductionKg = parseFloat(productionResult[0]?.totalKg || '0');

        // 4. Total Sales & Total Sales KG
        const salesInvoicesResult = await db.query.salesInvoices.findMany({
            where: and(
                invoiceDateQuery,
                eq(salesInvoices.status, 'Confirmed')
            ),
            with: { items: true }
        });

        let totalSalesRevenue = 0;
        let totalSalesKg = 0;

        salesInvoicesResult.forEach(inv => {
            totalSalesRevenue += parseFloat(inv.taxableAmount || '0');
            inv.items.forEach(item => {
                totalSalesKg += parseFloat(item.quantity || '0');
            });
        });

        // 5. Calculate Metrics
        const totalCost = totalPurchases + totalExpenses;
        const costPerKg = totalProductionKg > 0 ? totalCost / totalProductionKg : 0;
        const avgSellingPrice = totalSalesKg > 0 ? totalSalesRevenue / totalSalesKg : 0;
        const profitPerKg = avgSellingPrice > 0 && costPerKg > 0 ? avgSellingPrice - costPerKg : 0;

        res.json(successResponse({
            month: month === 'all' ? 'all' : (month || (startDate && `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`)),
            totalPurchases,
            totalExpenses,
            totalCost,
            totalProductionKg,
            totalSalesRevenue,
            totalSalesKg,
            costPerKg,
            avgSellingPrice,
            profitPerKg,
            expenseBreakdown
        }));

    } catch (error) {
        next(error);
    }
});

export default router;
