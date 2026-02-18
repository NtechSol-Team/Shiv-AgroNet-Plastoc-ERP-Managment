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
                    with: {
                        finishedProduct: true // Product is now item-level
                    }
                }
            }
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
        const { items, batchCode } = req.body;

        if (!batchCode) {
            throw createError('Batch Code is required', 400);
        }

        if (!Array.isArray(items) || items.length === 0) {
            throw createError('At least one Item is required', 400);
        }

        // Check for existing batch code
        const existingBatch = await db.query.bellBatches.findFirst({
            where: eq(bellBatches.code, batchCode)
        });
        if (existingBatch) {
            throw createError(`Batch Code ${batchCode} already exists`, 400);
        }

        // 1. Group Items by Product to Validate Stock and Calculate Totals
        // Stock validation uses NET WEIGHT (gross - weightLoss/1000)
        const productNetTotals = new Map<string, number>(); // For stock validation
        const productGrossTotals = new Map<string, number>(); // For batch total weight display
        const productValidations = new Map<string, any>();

        let grandTotalGrossWeight = 0;

        // Process each item and calculate net weights
        const processedItems = items.map((item: any) => {
            if (!item.finishedProductId) throw createError('Product ID is required for all items', 400);
            if (!item.gsm || !item.size) throw createError('GSM and Size are required for all items', 400);

            const grossWeight = parseFloat(item.grossWeight) || 0;
            const weightLoss = parseFloat(item.weightLoss) || 0; // in grams
            const netWeight = grossWeight - (weightLoss / 1000);

            if (netWeight <= 0) throw createError('Net weight must be positive', 400);

            const currentNetTotal = productNetTotals.get(item.finishedProductId) || 0;
            const currentGrossTotal = productGrossTotals.get(item.finishedProductId) || 0;

            productNetTotals.set(item.finishedProductId, currentNetTotal + netWeight);
            productGrossTotals.set(item.finishedProductId, currentGrossTotal + grossWeight);
            grandTotalGrossWeight += grossWeight;

            return {
                ...item,
                grossWeight,
                weightLoss,
                netWeight
            };
        });

        // 2. Validate Stock for EACH Product (based on NET weight - what we're deducting)
        for (const [pid, totalNetWeight] of productNetTotals.entries()) {
            const stockCheck = await validateFinishedProductStock(pid, totalNetWeight);
            if (!stockCheck.isValid) {
                throw createError(`Insufficient stock for product ${pid} (Required: ${totalNetWeight.toFixed(2)}kg, Available: ${stockCheck.currentStock.toFixed(2)}kg)`, 400);
            }
            productValidations.set(pid, stockCheck);
        }

        await db.transaction(async (tx) => {
            // A. Insert Batch (total weight = gross weight for display purposes)
            const [newBatch] = await tx.insert(bellBatches).values({
                code: batchCode,
                totalWeight: String(grandTotalGrossWeight),
                status: 'Active'
            }).returning();

            // B. Insert Items with grossWeight, weightLoss, and calculated netWeight
            for (let i = 0; i < processedItems.length; i++) {
                const item = processedItems[i];
                const itemCode = `BEL-${batchCode}-${(i + 1).toString().padStart(3, '0')}`;

                await tx.insert(bellItems).values({
                    code: itemCode,
                    batchId: newBatch.id,
                    finishedProductId: item.finishedProductId,
                    gsm: item.gsm,
                    size: item.size,
                    pieceCount: item.pieceCount ? String(item.pieceCount) : '1',
                    grossWeight: String(item.grossWeight),
                    weightLoss: String(item.weightLoss),
                    netWeight: String(item.netWeight),
                    status: 'Available'
                });
            }

            // C. Deduct Stock (FG_OUT) - based on NET WEIGHT (actual material consumed)
            for (const [pid, totalNetWeight] of productNetTotals.entries()) {
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: pid,
                    quantityOut: totalNetWeight,
                    referenceType: 'Bell Production',
                    referenceCode: batchCode,
                    referenceId: newBatch.id,
                    reason: `Bell Batch Creation (${processedItems.filter((i: any) => i.finishedProductId === pid).length} items)`
                }, tx);
            }

            res.json(successResponse(newBatch));
        });

    } catch (error) {
        next(error);
    }
});

/**
 * PUT /bell-inventory/:id
 * Update a Bell Item (pieceCount, grossWeight, weightLoss) with stock adjustment
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { pieceCount, grossWeight, weightLoss } = req.body;

        // Find the bell item
        const item = await db.query.bellItems.findFirst({
            where: eq(bellItems.id, id)
        });

        if (!item) throw createError('Bell item not found', 404);
        if (item.status !== 'Available') throw createError('Cannot edit: Item has already been issued or deleted', 400);

        // Calculate old and new net weights
        const oldNetWeight = parseFloat(item.netWeight || '0');

        // Determine new values
        const newGrossWeight = grossWeight !== undefined ? parseFloat(grossWeight) : parseFloat(item.grossWeight || '0');
        const newWeightLoss = weightLoss !== undefined ? parseFloat(weightLoss) : parseFloat(item.weightLoss || '0');

        // Calculate new net weight: grossWeight - (weightLoss in grams / 1000)
        const newNetWeight = newGrossWeight - (newWeightLoss / 1000);

        if (newNetWeight <= 0) {
            throw createError(`Net Weight must be positive. Gross: ${newGrossWeight}kg, Loss: ${newWeightLoss}g = Net: ${newNetWeight.toFixed(2)}kg`, 400);
        }

        const netWeightDifference = newNetWeight - oldNetWeight;

        // Get the batch for reference code
        const batch = await db.query.bellBatches.findFirst({
            where: eq(bellBatches.id, item.batchId)
        });

        // If net weight changed, create stock adjustment
        if (Math.abs(netWeightDifference) > 0.001) {
            if (netWeightDifference > 0) {
                // Net weight increased - need to deduct more from finished goods
                const stockCheck = await validateFinishedProductStock(item.finishedProductId, netWeightDifference);
                if (!stockCheck.isValid) {
                    throw createError(`Insufficient stock for weight increase (Required: ${netWeightDifference.toFixed(2)}kg, Available: ${stockCheck.currentStock.toFixed(2)}kg)`, 400);
                }

                // Deduct additional stock
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: item.finishedProductId,
                    quantityOut: netWeightDifference,
                    referenceType: 'Bell Item Edit',
                    referenceCode: batch?.code || 'EDIT',
                    referenceId: item.id,
                    reason: `Bell item net weight increased from ${oldNetWeight.toFixed(2)} to ${newNetWeight.toFixed(2)}`
                });
            } else {
                // Net weight decreased - refund stock to finished goods
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_IN',
                    itemType: 'finished_product',
                    finishedProductId: item.finishedProductId,
                    quantityIn: Math.abs(netWeightDifference),
                    referenceType: 'Bell Item Edit',
                    referenceCode: batch?.code || 'EDIT',
                    referenceId: item.id,
                    reason: `Bell item net weight decreased from ${oldNetWeight.toFixed(2)} to ${newNetWeight.toFixed(2)}`
                });
            }
        }

        // Update the item
        const [updatedItem] = await db.update(bellItems)
            .set({
                pieceCount: pieceCount !== undefined ? String(pieceCount) : item.pieceCount,
                grossWeight: String(newGrossWeight),
                weightLoss: String(newWeightLoss),
                netWeight: String(newNetWeight),
                updatedAt: new Date()
            })
            .where(eq(bellItems.id, id))
            .returning();

        // Recalculate and update batch total weight (uses GROSS weight for display)
        const allBatchItems = await db.query.bellItems.findMany({
            where: and(
                eq(bellItems.batchId, item.batchId),
                ne(bellItems.status, 'Deleted')
            )
        });

        const newTotalWeight = allBatchItems.reduce((sum, i) => sum + parseFloat(i.grossWeight || '0'), 0);

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
 * DELETE /bell-inventory/items/:id
 * Delete an individual bale from a batch
 */
router.delete('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        await db.transaction(async (tx) => {
            // 1. Get Item
            const item = await tx.query.bellItems.findFirst({
                where: eq(bellItems.id, id)
            });
            if (!item) throw createError('Bale not found', 404);

            // 2. Refund Stock (FG_IN)
            await createStockMovement({
                date: new Date(),
                movementType: 'FG_IN',
                itemType: 'finished_product',
                finishedProductId: item.finishedProductId,
                quantityIn: parseFloat(item.netWeight),
                referenceType: 'Bale Delete',
                referenceCode: item.code,
                referenceId: item.id,
                reason: `Bale Delete: ${item.code}`
            }, tx);

            // 3. Update Batch Total Weight
            const batch = await tx.query.bellBatches.findFirst({
                where: eq(bellBatches.id, item.batchId)
            });
            if (batch) {
                const newTotalWeight = parseFloat(batch.totalWeight) - parseFloat(item.grossWeight);
                await tx.update(bellBatches)
                    .set({ totalWeight: String(newTotalWeight), updatedAt: new Date() })
                    .where(eq(bellBatches.id, item.batchId));
            }

            // 4. Hard Delete Item
            await tx.delete(bellItems)
                .where(eq(bellItems.id, id));
        });

        res.json(successResponse({ message: 'Bale deleted successfully' }));
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
                items: true
            }
        });

        if (!batch) throw createError('Batch not found', 404);

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
            // A. Delete Items first (handled by cascade, but good to be explicit or if we did manual refund)
            await tx.delete(bellItems)
                .where(eq(bellItems.batchId, id));

            // B. Delete Batch
            await tx.delete(bellBatches)
                .where(eq(bellBatches.id, id));

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
                }, tx);
            }

            res.json(successResponse({ message: 'Bell Batch deleted and stock restored' }));
        });

    } catch (error) {
        next(error);
    }
});

export default router;
