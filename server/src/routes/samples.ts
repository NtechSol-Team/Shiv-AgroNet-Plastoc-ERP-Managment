
import { Router, Request, Response } from 'express';
import { db } from '../db/index';
import { productSamples, finishedProducts, suppliers, bellItems } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { createStockMovement } from '../services/inventory.service';
import { createError } from '../middleware/errorHandler';

const router = Router();

const successResponse = (data: any, message: string = 'Success') => ({
    success: true,
    message,
    data
});

// GET /api/samples
router.get('/', async (req, res, next) => {
    try {
        const result = await db
            .select({
                id: productSamples.id,
                date: productSamples.date,
                quantity: productSamples.quantity,
                purpose: productSamples.purpose,
                notes: productSamples.notes,
                batchCode: productSamples.batchCode,
                partyName: suppliers.name,
                productName: finishedProducts.name,
                productCode: finishedProducts.code,
                bellItemId: productSamples.bellItemId,
                baleCode: bellItems.code
            })
            .from(productSamples)
            .leftJoin(suppliers, eq(productSamples.partyId, suppliers.id))
            .innerJoin(finishedProducts, eq(productSamples.finishedProductId, finishedProducts.id))
            .leftJoin(bellItems, eq(productSamples.bellItemId, bellItems.id))
            .orderBy(desc(productSamples.date));

        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

// POST /api/samples
router.post('/', async (req: Request, res: Response, next: Function) => {
    try {
        const { partyId, finishedProductId, quantity, date, purpose, notes, batchCode, bellItemId } = req.body;

        if (!finishedProductId || !quantity) {
            throw createError('Product and Quantity are required', 400);
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            throw createError('Invalid quantity', 400);
        }

        await db.transaction(async (tx) => {
            // 1. Create Sample Record
            const [sample] = (await tx
                .insert(productSamples)
                .values({
                    partyId: partyId || null,
                    finishedProductId,
                    bellItemId: bellItemId || null,
                    quantity: qty.toString(),
                    date: new Date(date || new Date()),
                    purpose,
                    notes,
                    batchCode
                })
                .returning()) as any[];

            // 2. If it's a Bale, mark it as Issued and Link to Sample
            if (bellItemId) {
                const [bale] = await tx.select().from(bellItems).where(eq(bellItems.id, bellItemId));
                if (!bale) throw createError('Bale not found', 404);
                if (bale.status !== 'Available') throw createError('Bale is already issued or sold', 400);

                await tx.update(bellItems)
                    .set({
                        status: 'Issued',
                        productSampleId: sample.id,
                        updatedAt: new Date()
                    })
                    .where(eq(bellItems.id, bellItemId));
            }

            // 3. Decrease Stock (FG_OUT) - ONLY for generic samples
            // Bales already deducted stock from FG when they were produced
            if (!bellItemId) {
                await createStockMovement({
                    date: new Date(date || new Date()),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId,
                    quantityOut: qty,
                    referenceType: 'Generic Sample',
                    referenceCode: 'SAMPLE',
                    referenceId: sample.id,
                    reason: `Sample to ${partyId ? 'Party' : 'General'}: ${purpose || 'Not specified'}`
                }, tx);
            }

            res.status(201).json(successResponse(sample, 'Sample recorded successfully'));
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/samples/:id
router.put('/:id', async (req: Request, res: Response, next: Function) => {
    try {
        const { id } = req.params;
        const { partyId, finishedProductId, quantity, date, purpose, notes, batchCode, bellItemId } = req.body;

        await db.transaction(async (tx) => {
            // 1. Get Old Sample Details
            const [oldSample] = await tx.select().from(productSamples).where(eq(productSamples.id, id));
            if (!oldSample) {
                throw createError('Sample not found', 404);
            }

            // 2. Handle Bale Status Changes
            if (oldSample.bellItemId !== bellItemId) {
                // A. Restore old bale to Available if it existed
                if (oldSample.bellItemId) {
                    await tx.update(bellItems)
                        .set({ status: 'Available', updatedAt: new Date() })
                        .where(eq(bellItems.id, oldSample.bellItemId));
                }

                // B. Mark new bale as Issued if it exists
                if (bellItemId) {
                    const [newBale] = await tx.select().from(bellItems).where(eq(bellItems.id, bellItemId));
                    if (!newBale) throw createError('New Bale not found', 404);
                    if (newBale.status !== 'Available') throw createError('New Bale is already issued or deleted', 400);

                    await tx.update(bellItems)
                        .set({ status: 'Issued', updatedAt: new Date() })
                        .where(eq(bellItems.id, bellItemId));
                }
            }

            // 3. Handle Stock Adjustment
            const oldQty = parseFloat(oldSample.quantity);
            const newQty = parseFloat(quantity);
            const productChanged = oldSample.finishedProductId !== finishedProductId;
            const qtyChanged = oldQty !== newQty;

            if (productChanged || qtyChanged) {
                // Determine if OLD sample was a bale or generic
                if (!oldSample.bellItemId) {
                    // A. Reverse Old Deduction (FG_IN)
                    await createStockMovement({
                        date: new Date(),
                        movementType: 'FG_IN',
                        itemType: 'finished_product',
                        finishedProductId: oldSample.finishedProductId,
                        quantityIn: oldQty,
                        referenceType: 'sample_edit_rev',
                        referenceCode: 'SAMPLE-EDIT',
                        referenceId: id,
                        reason: `Sample Edit: Reversing old quantity ${oldQty}`
                    }, tx);
                }

                // Determine if NEW sample is a bale or generic
                if (!bellItemId) {
                    // B. Apply New Deduction (FG_OUT)
                    await createStockMovement({
                        date: new Date(date || new Date()),
                        movementType: 'FG_OUT',
                        itemType: 'finished_product',
                        finishedProductId: finishedProductId,
                        quantityOut: newQty,
                        referenceType: 'Generic Sample',
                        referenceCode: 'SAMPLE',
                        referenceId: id,
                        reason: `Sample Edit: Updated to ${newQty}`
                    }, tx);
                }
            }

            // 4. Update Bale Status If Changed
            if (oldSample.bellItemId !== bellItemId) {
                // A. Restore Old Bale
                if (oldSample.bellItemId) {
                    await tx.update(bellItems)
                        .set({ status: 'Available', productSampleId: null, updatedAt: new Date() })
                        .where(eq(bellItems.id, oldSample.bellItemId));
                }
                // B. Issue New Bale
                if (bellItemId) {
                    await tx.update(bellItems)
                        .set({ status: 'Issued', productSampleId: id, updatedAt: new Date() })
                        .where(eq(bellItems.id, bellItemId));
                }
            }

            // 4. Update Sample Record
            const [updatedSample] = await tx
                .update(productSamples)
                .set({
                    partyId: partyId || null,
                    finishedProductId,
                    bellItemId: bellItemId || null,
                    quantity: newQty.toString(),
                    date: new Date(date),
                    purpose,
                    notes,
                    batchCode
                })
                .where(eq(productSamples.id, id))
                .returning();

            res.json(successResponse(updatedSample, 'Sample updated successfully'));
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/samples/:id
router.delete('/:id', async (req: Request, res: Response, next: Function) => {
    try {
        const { id } = req.params;

        await db.transaction(async (tx) => {
            // 1. Get Sample Details
            const [sample] = await tx.select().from(productSamples).where(eq(productSamples.id, id));
            if (!sample) {
                throw createError('Sample not found', 404);
            }

            // 2. Restore Bale Status if linked
            // 2. Restore Bale Status if linked
            if (sample.bellItemId) {
                await tx.update(bellItems)
                    .set({ status: 'Available', productSampleId: null, updatedAt: new Date() })
                    .where(eq(bellItems.id, sample.bellItemId));
            }

            // 3. Reverse Stock Deduction (FG_IN) - ONLY for generic samples
            if (!sample.bellItemId) {
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_IN',
                    itemType: 'finished_product',
                    finishedProductId: sample.finishedProductId,
                    quantityIn: parseFloat(sample.quantity),
                    referenceType: 'sample_return',
                    referenceCode: 'SAMPLE-REV',
                    referenceId: sample.id,
                    reason: `Sample Deletion: Reversing stock for ${sample.quantity}`
                }, tx);
            }

            // 4. Delete Sample Record
            await tx.delete(productSamples).where(eq(productSamples.id, id));

            res.json(successResponse(null, 'Sample deleted and stock reversed successfully'));
        });
    } catch (error) {
        next(error);
    }
});

export default router;
