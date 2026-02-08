import { Router, Request, Response, NextFunction } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { db } from '../db/index';
import { bellBatches, bellItems } from '../db/schema';
import { eq, desc, and, ne } from 'drizzle-orm';
import { createStockMovement, validateFinishedProductStock } from '../services/inventory.service';

const router = Router();

/**
 * GET /bell-inventory
 * Get all Bell Batches with their Items
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batches = await db.query.bellBatches.findMany({
            orderBy: [desc(bellBatches.createdAt)],
            with: {
                // finishedProduct: true, // Removed from Batch
                items: {
                    orderBy: [desc(bellItems.createdAt)],
                    where: ne(bellItems.status, 'Deleted'),
                    with: {
                        finishedProduct: true // Product is now item-level
                    }
                }
            },
            where: ne(bellBatches.status, 'Deleted')
        });

        res.json(successResponse(batches));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /bell-inventory
 * Create a Bell Batch with multiple Items (Mixed Products allowed)
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            throw createError('At least one Item is required', 400);
        }

        // 1. Group Items by Product to Validate Stock and Calculate Totals
        const productTotals = new Map<string, number>();
        const productValidations = new Map<string, any>();

        let grandTotalWeight = 0;

        for (const item of items) {
            if (!item.finishedProductId) throw createError('Product ID is required for all items', 400);
            const w = parseFloat(item.netWeight);
            if (isNaN(w) || w <= 0) throw createError('All items must have valid positive Net Weight', 400);
            if (!item.gsm || !item.size) throw createError('GSM and Size are required for all items', 400);

            grandTotalWeight += w;
            const currentTotal = productTotals.get(item.finishedProductId) || 0;
            productTotals.set(item.finishedProductId, currentTotal + w);
        }

        // 2. Validate Stock for EACH Product
        for (const [pid, totalW] of productTotals.entries()) {
            const stockCheck = await validateFinishedProductStock(pid, totalW);
            if (!stockCheck.isValid) {
                throw createError(`Insufficient stock for product ${pid} (Required: ${totalW.toFixed(2)}, Available: ${stockCheck.currentStock.toFixed(2)})`, 400);
            }
            productValidations.set(pid, stockCheck);
        }

        const batchCode = `BB-${Date.now().toString().slice(-6)}`;

        await db.transaction(async (tx) => {
            // A. Insert Batch
            const [newBatch] = await tx.insert(bellBatches).values({
                code: batchCode,
                // finishedProductId: null, // Removed
                totalWeight: String(grandTotalWeight),
                status: 'Active'
            }).returning();

            // B. Insert Items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemCode = `BEL-${batchCode.split('-')[1]}-${(i + 1).toString().padStart(3, '0')}`;

                await tx.insert(bellItems).values({
                    code: itemCode,
                    batchId: newBatch.id,
                    finishedProductId: item.finishedProductId, // Per Item
                    gsm: item.gsm,
                    size: item.size,
                    pieceCount: item.pieceCount ? String(item.pieceCount) : '1',
                    netWeight: String(item.netWeight),
                    status: 'Available'
                });
            }

            // C. Deduct Stock (FG_OUT) - One movement per Product
            for (const [pid, totalW] of productTotals.entries()) {
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: pid,
                    quantityOut: totalW,
                    referenceType: 'Bell Production',
                    referenceCode: batchCode,
                    referenceId: newBatch.id,
                    reason: `Bell Batch Creation (${items.filter((i: any) => i.finishedProductId === pid).length} items)`
                });
            }

            res.json(successResponse(newBatch));
        });

    } catch (error) {
        next(error);
    }
});

/**
 * PUT /bell-inventory/:id
 * Update a Bell Item (pieceCount, netWeight) with stock adjustment
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { pieceCount, netWeight } = req.body;

        // Find the bell item
        const item = await db.query.bellItems.findFirst({
            where: eq(bellItems.id, id)
        });

        if (!item) throw createError('Bell item not found', 404);
        if (item.status !== 'Available') throw createError('Cannot edit: Item has already been issued or deleted', 400);

        const oldWeight = parseFloat(item.netWeight || '0');
        const newWeight = netWeight !== undefined ? parseFloat(netWeight) : oldWeight;
        const weightDifference = newWeight - oldWeight;

        // Get the batch for reference code
        const batch = await db.query.bellBatches.findFirst({
            where: eq(bellBatches.id, item.batchId)
        });

        // If weight changed, create stock adjustment
        if (Math.abs(weightDifference) > 0.001) {
            if (weightDifference > 0) {
                // Weight increased - need to deduct more from finished goods
                const stockCheck = await validateFinishedProductStock(item.finishedProductId, weightDifference);
                if (!stockCheck.isValid) {
                    throw createError(`Insufficient stock for weight increase (Required: ${weightDifference.toFixed(2)}, Available: ${stockCheck.currentStock.toFixed(2)})`, 400);
                }

                // Deduct additional stock
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: item.finishedProductId,
                    quantityOut: weightDifference,
                    referenceType: 'Bell Item Edit',
                    referenceCode: batch?.code || 'EDIT',
                    referenceId: item.id,
                    reason: `Bell item weight increased from ${oldWeight} to ${newWeight}`
                });
            } else {
                // Weight decreased - refund stock to finished goods
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_IN',
                    itemType: 'finished_product',
                    finishedProductId: item.finishedProductId,
                    quantityIn: Math.abs(weightDifference),
                    referenceType: 'Bell Item Edit',
                    referenceCode: batch?.code || 'EDIT',
                    referenceId: item.id,
                    reason: `Bell item weight decreased from ${oldWeight} to ${newWeight}`
                });
            }
        }

        // Update the item
        const [updatedItem] = await db.update(bellItems)
            .set({
                pieceCount: pieceCount !== undefined ? String(pieceCount) : item.pieceCount,
                netWeight: netWeight !== undefined ? String(netWeight) : item.netWeight,
                updatedAt: new Date()
            })
            .where(eq(bellItems.id, id))
            .returning();

        // Recalculate and update batch total weight
        const allBatchItems = await db.query.bellItems.findMany({
            where: and(
                eq(bellItems.batchId, item.batchId),
                ne(bellItems.status, 'Deleted')
            )
        });

        const newTotalWeight = allBatchItems.reduce((sum, i) => sum + parseFloat(i.netWeight || '0'), 0);

        await db.update(bellBatches)
            .set({
                totalWeight: String(newTotalWeight),
                updatedAt: new Date()
            })
            .where(eq(bellBatches.id, item.batchId));

        res.json(successResponse(updatedItem));

    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /bell-inventory/:id
 * Delete a Bell Batch (Soft Delete) and Refund Stock
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Fetch batch details including items to know what to refund
        const batch = await db.query.bellBatches.findFirst({
            where: eq(bellBatches.id, id),
            with: {
                items: {
                    where: ne(bellItems.status, 'Deleted')
                }
            }
        });

        if (!batch) throw createError('Batch not found', 404);
        if (batch.status === 'Deleted') throw createError('Batch already deleted', 400);

        // Check if any items are Issued?
        // If an item is Issued, we usually shouldn't delete the Batch easily.
        const issuedItems = batch.items.filter((item: any) => item.status === 'Issued');
        if (issuedItems.length > 0) throw createError('Cannot delete Batch: Some items have been Issued.', 400);

        // Calculate Refund Totals per Product
        const productRefunds = new Map<string, number>();
        for (const item of batch.items) {
            const w = parseFloat(item.netWeight);
            const pid = item.finishedProductId;
            const current = productRefunds.get(pid) || 0;
            productRefunds.set(pid, current + w);
        }

        await db.transaction(async (tx) => {
            // A. Mark Batch as Deleted
            await tx.update(bellBatches)
                .set({ status: 'Deleted', updatedAt: new Date() })
                .where(eq(bellBatches.id, id));

            // B. Mark Items as Deleted
            await tx.update(bellItems)
                .set({ status: 'Deleted', updatedAt: new Date() })
                .where(eq(bellItems.batchId, id));

            // C. Refund Stock (FG_IN) per Product
            for (const [pid, totalW] of productRefunds.entries()) {
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_IN',
                    itemType: 'finished_product',
                    finishedProductId: pid,
                    quantityIn: totalW,
                    referenceType: 'Bell Batch Deletion',
                    referenceCode: batch.code,
                    referenceId: batch.id,
                    reason: 'Batch Deleted / Restored to Stock'
                });
            }

            res.json(successResponse({ message: 'Bell Batch deleted and stock restored' }));
        });

    } catch (error) {
        next(error);
    }
});

export default router;
