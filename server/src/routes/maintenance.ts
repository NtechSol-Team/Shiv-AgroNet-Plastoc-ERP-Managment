
import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import {
    stockMovements,
    rawMaterialRolls,
    productionBatches,
    productionBatchInputs,
    productionBatchOutputs,
    purchaseBills,
    purchaseBillItems,
    salesInvoices,
    invoiceItems
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { successResponse } from '../types/api';

const router = Router();

/**
 * POST /maintenance/recalculate-stock
 * Rebuilds the stockMovements ledger from scratch based on all primary documents.
 */
router.post('/recalculate-stock', async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('--- Starting Stock Reconciliation ---');

        await db.transaction(async (tx) => {
            // 1. Clear existing movements
            await tx.delete(stockMovements);
            console.log('✓ Cleared stock_movements table');

            // 2. RAW_IN: From Raw Material Rolls
            const rolls = await tx.select().from(rawMaterialRolls);
            for (const roll of rolls) {
                await tx.insert(stockMovements).values({
                    date: roll.createdAt || new Date(),
                    movementType: 'RAW_IN',
                    itemType: 'raw_material',
                    rawMaterialId: roll.rawMaterialId,
                    quantityIn: roll.netWeight,
                    quantityOut: '0',
                    referenceType: 'purchase_roll',
                    referenceCode: roll.rollCode,
                    referenceId: roll.id,
                    reason: 'Recalculated: Roll Entry'
                });
            }
            console.log(`✓ Rebuilt ${rolls.length} RAW_IN movements from rolls`);

            // 3. RAW_OUT: From Production Batch Inputs
            const inputs = await tx.select().from(productionBatchInputs);
            for (const input of inputs) {
                // Get batch code for reference
                const [batch] = await tx.select({ code: productionBatches.code }).from(productionBatches).where(eq(productionBatches.id, input.batchId));
                await tx.insert(stockMovements).values({
                    date: input.createdAt || new Date(),
                    movementType: 'RAW_OUT',
                    itemType: 'raw_material',
                    rawMaterialId: input.rawMaterialId,
                    quantityIn: '0',
                    quantityOut: input.quantity,
                    referenceType: 'production',
                    referenceCode: batch?.code || 'UNKNOWN',
                    referenceId: input.batchId,
                    reason: 'Recalculated: Production Input'
                });
            }
            console.log(`✓ Rebuilt ${inputs.length} RAW_OUT movements from production inputs`);

            // 4. FG_IN (Production): From Production Batch Outputs
            const outputs = await tx.select().from(productionBatchOutputs);
            for (const output of outputs) {
                const [batch] = await tx.select({ code: productionBatches.code, status: productionBatches.status }).from(productionBatches).where(eq(productionBatches.id, output.batchId));
                // Only completed or in-progress batches that have produced something
                if (batch && (batch.status === 'completed' || batch.status === 'in-progress')) {
                    await tx.insert(stockMovements).values({
                        date: output.createdAt || new Date(),
                        movementType: 'FG_IN',
                        itemType: 'finished_product',
                        finishedProductId: output.finishedProductId,
                        quantityIn: output.outputQuantity,
                        quantityOut: '0',
                        referenceType: 'production',
                        referenceCode: batch.code,
                        referenceId: output.batchId,
                        reason: 'Recalculated: Production Output'
                    });
                }
            }
            console.log(`✓ Rebuilt FG_IN movements from production outputs`);

            // 5. FG_IN (Purchase): From Finished Goods Purchase Bills
            const fgPurchases = await tx
                .select()
                .from(purchaseBills)
                .innerJoin(purchaseBillItems, eq(purchaseBills.id, purchaseBillItems.billId))
                .where(and(
                    eq(purchaseBills.type, 'FINISHED_GOODS'),
                    eq(purchaseBills.status, 'Confirmed')
                ));

            for (const item of fgPurchases) {
                await tx.insert(stockMovements).values({
                    date: item.purchase_bills.date || new Date(),
                    movementType: 'FG_IN',
                    itemType: 'finished_product',
                    finishedProductId: item.purchase_bill_items.finishedProductId!,
                    quantityIn: item.purchase_bill_items.quantity,
                    quantityOut: '0',
                    referenceType: 'purchase',
                    referenceCode: item.purchase_bills.code,
                    referenceId: item.purchase_bills.id,
                    reason: 'Recalculated: FG Purchase'
                });
            }
            console.log(`✓ Rebuilt ${fgPurchases.length} FG_IN movements from purchases`);

            // 6. FG_OUT (Sales): From Sales Invoices
            const sales = await tx
                .select()
                .from(salesInvoices)
                .innerJoin(invoiceItems, eq(salesInvoices.id, invoiceItems.invoiceId))
                .where(eq(salesInvoices.status, 'Confirmed'));

            for (const item of sales) {
                await tx.insert(stockMovements).values({
                    date: item.sales_invoices.invoiceDate || new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: item.invoice_items.finishedProductId,
                    quantityIn: '0',
                    quantityOut: item.invoice_items.quantity,
                    referenceType: 'sales',
                    referenceCode: item.sales_invoices.invoiceNumber,
                    referenceId: item.sales_invoices.id,
                    reason: 'Recalculated: Sales Invoice'
                });
            }
            console.log(`✓ Rebuilt ${sales.length} FG_OUT movements from sales`);
        });

        console.log('--- Stock Reconciliation Completed ---');
        res.json(successResponse({ message: 'Stock movements recalculated successfully' }));
    } catch (error) {
        console.error('Stock Reconciliation Error:', error);
        next(error);
    }
});

export default router;
