
import { Router, Request, Response } from 'express';
import { db } from '../db/index';
import { productSamples, finishedProducts, suppliers } from '../db/schema';
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
                productCode: finishedProducts.code
            })
            .from(productSamples)
            .leftJoin(suppliers, eq(productSamples.partyId, suppliers.id))
            .innerJoin(finishedProducts, eq(productSamples.finishedProductId, finishedProducts.id))
            .orderBy(desc(productSamples.date));

        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

// POST /api/samples
router.post('/', async (req: Request, res: Response, next: Function) => {
    try {
        const { partyId, finishedProductId, quantity, date, purpose, notes, batchCode } = req.body;

        if (!finishedProductId || !quantity) {
            throw createError('Product and Quantity are required', 400);
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            throw createError('Invalid quantity', 400);
        }

        // 1. Create Sample Record
        const [sample] = await db
            .insert(productSamples)
            .values({
                partyId: partyId || null,
                finishedProductId,
                quantity: qty.toString(),
                date: new Date(date || new Date()),
                purpose,
                notes,
                batchCode
            })
            .returning();

        // 2. Decrease Stock (FG_OUT)
        // Check if there's enough stock first? Assuming yes or allowing negative for now as per system design
        // Get product details for reference
        const [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, finishedProductId));

        await createStockMovement({
            date: new Date(date || new Date()),
            movementType: 'FG_OUT',
            itemType: 'finished_product',
            finishedProductId,
            quantityOut: qty,
            referenceType: 'sample_out',
            referenceCode: 'SAMPLE', // Or use sample ID/Batch
            referenceId: sample.id,
            reason: `Sample to ${partyId ? 'Party' : 'General'}: ${purpose || 'Not specified'}`
        });

        res.status(201).json(successResponse(sample, 'Sample recorded successfully'));
    } catch (error) {
        next(error);
    }
});

// PUT /api/samples/:id
router.put('/:id', async (req: Request, res: Response, next: Function) => {
    try {
        const { id } = req.params;
        const { partyId, finishedProductId, quantity, date, purpose, notes, batchCode } = req.body;

        // 1. Get Old Sample Details
        const [oldSample] = await db.select().from(productSamples).where(eq(productSamples.id, id));
        if (!oldSample) {
            throw createError('Sample not found', 404);
        }

        // 2. Handle Stock Adjustment
        // If Product or Quantity changed, we need to adjust stock
        const oldQty = parseFloat(oldSample.quantity);
        const newQty = parseFloat(quantity);
        const productChanged = oldSample.finishedProductId !== finishedProductId;
        const qtyChanged = oldQty !== newQty;

        if (productChanged || qtyChanged) {
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
            });

            // B. Apply New Deduction (FG_IN)
            await createStockMovement({
                date: new Date(date || new Date()), // Use new date
                movementType: 'FG_OUT',
                itemType: 'finished_product',
                finishedProductId: finishedProductId, // New Product
                quantityOut: newQty, // New Qty
                referenceType: 'sample_out',
                referenceCode: 'SAMPLE',
                referenceId: id,
                reason: `Sample Edit: Updated to ${newQty}`
            });
        }

        // 3. Update Sample Record
        const [updatedSample] = await db
            .update(productSamples)
            .set({
                partyId: partyId || null,
                finishedProductId,
                quantity: newQty.toString(),
                date: new Date(date),
                purpose,
                notes,
                batchCode
            })
            .where(eq(productSamples.id, id))
            .returning();

        res.json(successResponse(updatedSample, 'Sample updated successfully'));
    } catch (error) {
        next(error);
    }
});

// DELETE /api/samples/:id
router.delete('/:id', async (req: Request, res: Response, next: Function) => {
    try {
        const { id } = req.params;

        // 1. Get Sample Details
        const [sample] = await db.select().from(productSamples).where(eq(productSamples.id, id));
        if (!sample) {
            throw createError('Sample not found', 404);
        }

        // 2. Reverse Stock Deduction (FG_IN)
        // We use 'FG_IN' to put stock back, technically it's a correction/reversal
        await createStockMovement({
            date: new Date(),
            movementType: 'FG_IN',
            itemType: 'finished_product',
            finishedProductId: sample.finishedProductId,
            quantityIn: parseFloat(sample.quantity),
            referenceType: 'sample_return', // or sample_delete
            referenceCode: 'SAMPLE-REV',
            referenceId: sample.id, // Keeping ID for trace even if deleted from main table
            reason: `Sample Deletion: Reversing stock for ${sample.quantity}`
        });

        // 3. Delete Sample Record
        await db.delete(productSamples).where(eq(productSamples.id, id));

        res.json(successResponse(null, 'Sample deleted and stock reversed successfully'));
    } catch (error) {
        next(error);
    }
});

export default router;
